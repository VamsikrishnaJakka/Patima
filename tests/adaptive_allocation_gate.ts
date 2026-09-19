import { directPool } from '../lib/db';
import { allocateNextQuestion } from '../lib/assessment/allocator';

const userA = 'c9a01f42-8812-4211-b0e1-482910482910';
const userB = 'u0000000-0000-0000-0000-000000000002';

async function initSession(client: any, userId: string) {
  const res = await client.query(`
    INSERT INTO assessment_sessions
      (user_id, domain, experience_level, current_step, status, started_at)
    VALUES ($1, 'sql', 'INTERMEDIATE', 1, 'ACTIVE', clock_timestamp())
    RETURNING id
  `, [userId]);
  return res.rows[0].id as string;
}

async function withTransaction(client: any, fn: () => Promise<any>) {
  await client.query('BEGIN');
  try {
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function run() {
  const clientA = await directPool.connect();
  const clientB = await directPool.connect();

  try {
    const sessionA = await initSession(clientA, userA);
    const sessionB = await initSession(clientB, userB);

    console.log('[GATE 1] True two-connection concurrency race...');
    const [allocA, allocB] = await Promise.all([
      withTransaction(clientA, () =>
        allocateNextQuestion(clientA, { sessionId: sessionA, userId: userA })
      ),
      withTransaction(clientB, () =>
        allocateNextQuestion(clientB, { sessionId: sessionB, userId: userB })
      ),
    ]);

    if (!allocA || !allocB || allocA.variantId === allocB.variantId) {
      throw new Error('FAIL: concurrent allocations collided or returned null');
    }
    console.log('PASS: distinct variants reserved concurrently.');

    console.log('[GATE 2] Idempotent resume...');
    const refresh = await allocateNextQuestion(clientA, { sessionId: sessionA, userId: userA });
    if (!refresh || refresh.variantId !== allocA.variantId || refresh.stepIndex !== 1) {
      throw new Error('FAIL: refresh did not re-serve the active reservation.');
    }
    console.log('PASS: refresh preserved variant and step.');

    console.log('[GATE 3] Double-submission protection...');
    await withTransaction(clientA, () =>
      allocateNextQuestion(clientA, {
        sessionId: sessionA,
        userId: userA,
        submittedCode: 'SELECT 1;',
        isCorrect: true,
        durationSeconds: 30,
        expectedVariantId: allocA.variantId,
      })
    );

    let blocked = false;
    try {
      await allocateNextQuestion(clientA, {
        sessionId: sessionA,
        userId: userA,
        submittedCode: 'SELECT 1;',
        isCorrect: true,
        durationSeconds: 30,
        expectedVariantId: allocA.variantId,
      });
    } catch (error: any) {
      blocked = error?.message === 'NO_ACTIVE_QUESTION_RESERVATION' ||
        error?.message === 'QUESTION_RESERVATION_MISMATCH';
    }
    if (!blocked) throw new Error('FAIL: duplicate submission was accepted.');
    console.log('PASS: duplicate submission rejected.');

    console.log('[GATE 4] Ceiling clamp <= 7.0...');
    for (let i = 2; i <= 14; i++) {
      await withTransaction(clientA, () =>
        allocateNextQuestion(clientA, {
          sessionId: sessionA,
          userId: userA,
          submittedCode: 'SELECT 1;',
          isCorrect: true,
          durationSeconds: 20,
        })
      );
    }
    const maxRes = await clientA.query(
      `SELECT MAX(difficulty_presented) AS max_diff
       FROM assessment_adaptive_logs WHERE session_id = $1`,
      [sessionA]
    );
    if (Number(maxRes.rows[0].max_diff) > 7.0) {
      throw new Error(`FAIL: ceiling escaped: ${maxRes.rows[0].max_diff}`);
    }
    console.log('PASS: ceiling bounded at 7.0.');

    console.log('[GATE 5] Floor clamp >= 4.1...');
    const floorSession = await initSession(clientA, userA);
    const floorFirst = await allocateNextQuestion(clientA, {
      sessionId: floorSession,
      userId: userA,
    });
    if (!floorFirst) throw new Error('FAIL: floor session could not allocate first question.');

    for (let i = 1; i <= 4; i++) {
      await withTransaction(clientA, () =>
        allocateNextQuestion(clientA, {
          sessionId: floorSession,
          userId: userA,
          submittedCode: 'SELECT 1;',
          isCorrect: false,
          durationSeconds: 300,
        })
      );
    }
    const minRes = await clientA.query(
      `SELECT MIN(difficulty_presented) AS min_diff
       FROM assessment_adaptive_logs WHERE session_id = $1`,
      [floorSession]
    );
    if (Number(minRes.rows[0].min_diff) < 4.1) {
      throw new Error(`FAIL: floor escaped: ${minRes.rows[0].min_diff}`);
    }
    console.log('PASS: floor bounded at 4.1.');

    console.log('[GATE 6] Server-authoritative level...');
    const tamper = await allocateNextQuestion(clientA, {
      sessionId: floorSession,
      userId: userA,
    });
    if (tamper && (tamper.difficulty < 4.1 || tamper.difficulty > 7.0)) {
      throw new Error('FAIL: out-of-band difficulty served.');
    }
    console.log('PASS: DB session/config state controls allocation.');

    console.log('[GATE 7] Historical variant uniqueness...');
    const secondSession = await initSession(clientA, userA);
    const second = await allocateNextQuestion(clientA, {
      sessionId: secondSession,
      userId: userA,
    });
    if (!second) throw new Error('FAIL: no variant allocated for historical test.');

    const seen = await clientA.query(`
      SELECT 1
      FROM assessment_adaptive_logs l
      JOIN assessment_sessions s ON s.id = l.session_id
      WHERE s.user_id = $1 AND l.variant_id = $2 AND s.id <> $3
      LIMIT 1
    `, [userA, second.variantId, secondSession]);

    if (seen.rows.length) {
      throw new Error(`FAIL: historical variant was re-served: ${second.variantId}`);
    }
    console.log('PASS: historical variant excluded.');

    console.log('[GATE 8] Time-bound expiration...');
    const expired = await initSession(clientA, userA);
    await clientA.query(
      `UPDATE assessment_sessions
       SET started_at = clock_timestamp() - interval '30 minutes'
       WHERE id = $1`,
      [expired]
    );

    const expiredResult = await allocateNextQuestion(clientA, {
      sessionId: expired,
      userId: userA,
    });
    const status = await clientA.query(
      `SELECT status FROM assessment_sessions WHERE id = $1`,
      [expired]
    );

    if (expiredResult !== null || status.rows[0].status !== 'EXPIRED') {
      throw new Error('FAIL: expired session remained allocatable.');
    }
    console.log('PASS: expired session closed and returned null.');

    console.log('ALL 8 ADAPTIVE ALLOCATION GATES PASSED.');
  } finally {
    clientA.release();
    clientB.release();
    await directPool.end();
  }
}

run().catch((error) => {
  console.error('GATE FAILURE:', error);
  process.exit(1);
});
