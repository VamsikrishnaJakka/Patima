// lib/assessment/allocator.ts
import { PoolClient } from 'pg';

export interface NextQuestionRequest {
  sessionId: string;
  userId: string;
  submittedCode?: string;
  durationSeconds?: number;
  isCorrect?: boolean;
  expectedVariantId?: string;
}

export interface AllocatedQuestion {
  variantId: string;
  stepIndex: number;
  difficulty: number;
  promptMarkdown: string;
  scenarioEntity: string;
  fixtureDdl: string;
  totalQuestions: number;
  remainingTimeSeconds: number;
}

export async function allocateNextQuestion(
  client: PoolClient,
  req: NextQuestionRequest
): Promise<AllocatedQuestion | null> {
  // 1. Authoritative Session & Config Lookup (Locked exclusively)
  const sessionRes = await client.query(`
    SELECT s.id, s.user_id, s.domain, s.experience_level, s.current_step, 
           s.started_at, s.status,
           c.total_questions, c.duration_minutes, c.min_difficulty, 
           c.max_difficulty, c.starting_difficulty,
           -- PostgreSQL calculates authoritative remaining time
           GREATEST(0, EXTRACT(EPOCH FROM (s.started_at + (c.duration_minutes * interval '1 minute') - clock_timestamp())))::INT AS remaining_seconds
    FROM assessment_sessions s
    JOIN assessment_level_configs c 
      ON c.domain = s.domain AND c.experience_level = s.experience_level
    WHERE s.id = $1 AND s.user_id = $2
    FOR UPDATE OF s;
  `, [req.sessionId, req.userId]);

  if (sessionRes.rows.length === 0) throw new Error('SESSION_NOT_FOUND_OR_UNAUTHORIZED');
  const session = sessionRes.rows[0];

  if (session.status !== 'ACTIVE') return null;

  if (session.remaining_seconds <= 0) {
    await client.query(`UPDATE assessment_sessions SET status = 'EXPIRED' WHERE id = $1;`, [session.id]);
    return null;
  }

  // Clean expired reservations across the entire platform
  await client.query(`DELETE FROM active_question_reservations WHERE expires_at < clock_timestamp();`);

  // 2. Refresh / Resume Check: If an active reservation exists and no submission was sent, re-serve Question
  const activeRes = await client.query(`
    SELECT v.id, v.difficulty_score, v.prompt_markdown, v.scenario_entity, v.fixture_ddl
    FROM active_question_reservations r
    JOIN question_variants v ON v.id = r.variant_id
    WHERE r.session_id = $1 AND r.expires_at > clock_timestamp();
  `, [session.id]);

  if (activeRes.rows.length > 0 && !req.submittedCode) {
    const active = activeRes.rows[0];
    return {
      variantId: active.id,
      stepIndex: session.current_step,
      difficulty: Number(active.difficulty_score),
      promptMarkdown: active.prompt_markdown,
      scenarioEntity: active.scenario_entity,
      fixtureDdl: active.fixture_ddl,
      totalQuestions: session.total_questions,
      remainingTimeSeconds: session.remaining_seconds,
    };
  }

  // 3. Handle Completed Question Submission (Idempotent Step Advancement)
  let targetTheta = Number(session.starting_difficulty);

  if (req.submittedCode) {
    const submittedReservation = await client.query(`
      SELECT variant_id
      FROM active_question_reservations
      WHERE session_id = $1 AND expires_at > clock_timestamp()
      FOR UPDATE
    `, [session.id]);

    if (submittedReservation.rows.length === 0) {
      throw new Error('NO_ACTIVE_QUESTION_RESERVATION');
    }

    if (req.expectedVariantId && req.expectedVariantId !== submittedReservation.rows[0].variant_id) {
      throw new Error('QUESTION_RESERVATION_MISMATCH');
    }

    // Release active reservation for the completed question
    await client.query(`DELETE FROM active_question_reservations WHERE session_id = $1;`, [session.id]);

    // Check if step was already logged (Double-submission protection)
    const existingLog = await client.query(`
      SELECT computed_theta_next, candidate_response 
      FROM assessment_adaptive_logs 
      WHERE session_id = $1 AND step_index = $2;
    `, [session.id, session.current_step]);

    if (existingLog.rows.length > 0 && existingLog.rows[0].candidate_response !== null) {
      throw new Error('STEP_ALREADY_FINALIZED');
    }

    const prevTheta = existingLog.rows.length > 0 && existingLog.rows[0].computed_theta_next
      ? Number(existingLog.rows[0].computed_theta_next)
      : targetTheta;

    // Time-efficiency multiplier
    const timeFactor = (req.durationSeconds || 60) <= 45 ? 1.25 : 
                       (req.durationSeconds || 60) >= 180 ? 0.65 : 1.0;
    const delta = (req.isCorrect ? +0.35 : -0.30) * timeFactor;

    // Hard floor and ceiling clamping
    targetTheta = Math.min(
      Number(session.max_difficulty),
      Math.max(Number(session.min_difficulty), prevTheta + delta)
    );

    // Finalize current step in logs
    await client.query(`
      UPDATE assessment_adaptive_logs 
      SET candidate_response = $1, is_correct = $2, time_taken_seconds = $3, computed_theta_next = $4
      WHERE session_id = $5 AND step_index = $6;
    `, [req.submittedCode, req.isCorrect, req.durationSeconds || 0, targetTheta, session.id, session.current_step]);

    // Advance current_step
    const nextStep = session.current_step + 1;
    if (nextStep > session.total_questions) {
      await client.query(`
        UPDATE assessment_sessions 
        SET status = 'COMPLETED', completed_at = clock_timestamp(), final_theta = $1
        WHERE id = $2;
      `, [targetTheta, session.id]);
      return null;
    }

    await client.query(`UPDATE assessment_sessions SET current_step = $1 WHERE id = $2;`, [nextStep, session.id]);
    session.current_step = nextStep;
  }

  // 4. Atomic Selection of Next Question Variant
  const variantRes = await client.query(`
    SELECT v.id, v.family_id, v.difficulty_score, v.prompt_markdown, 
           v.scenario_entity, v.fixture_ddl
    FROM question_variants v
    JOIN question_families f ON f.id = v.family_id
    WHERE f.domain = $1
      AND v.experience_level = $2
      AND v.is_active = TRUE
      AND v.difficulty_score BETWEEN $6 AND $7
      -- Invariant 1: No duplicate family in this session
      AND v.family_id NOT IN (
        SELECT family_id FROM assessment_adaptive_logs WHERE session_id = $3
      )
      -- Invariant 2: Candidate has never seen this variant in any past session
      AND v.id NOT IN (
        SELECT l.variant_id 
        FROM assessment_adaptive_logs l
        JOIN assessment_sessions s ON s.id = l.session_id
        WHERE s.user_id = $4
      )
      -- Invariant 3: Exclude active reservations held by ANY other session
      AND v.id NOT IN (
        SELECT variant_id FROM active_question_reservations WHERE session_id != $3
      )
    ORDER BY 
      ABS(v.difficulty_score - $5) ASC,
      v.exposure_count ASC
    LIMIT 1
    FOR UPDATE OF v SKIP LOCKED;
  `, [session.domain, session.experience_level, session.id, session.user_id, targetTheta]);

  if (variantRes.rows.length === 0) {
    throw new Error('INSUFFICIENT_QUESTION_INVENTORY_FOR_SPECIFICATION');
  }

  const selected = variantRes.rows[0];

  // 5. Reserve using PostgreSQL's Clock directly
  await client.query(`
    INSERT INTO active_question_reservations (variant_id, session_id, expires_at)
    VALUES (
      $1, 
      $2, 
      (SELECT s.started_at + (c.duration_minutes * interval '1 minute') + interval '1 minute'
       FROM assessment_sessions s
       JOIN assessment_level_configs c ON c.domain = s.domain AND c.experience_level = s.experience_level
       WHERE s.id = $2)
    )
    ON CONFLICT (variant_id) DO UPDATE SET
      session_id = EXCLUDED.session_id,
      expires_at = EXCLUDED.expires_at;
  `, [selected.id, session.id]);

  // Log allocation for next step
  await client.query(`
    INSERT INTO assessment_adaptive_logs (
      session_id, step_index, variant_id, family_id, difficulty_presented, computed_theta_next
    ) VALUES ($1, $2, $3, $4, $5, $5)
    ON CONFLICT (session_id, step_index) DO NOTHING;
  `, [session.id, session.current_step, selected.id, selected.family_id, targetTheta]);

  // Update exposure count
  await client.query(`UPDATE question_variants SET exposure_count = exposure_count + 1 WHERE id = $1;`, [selected.id]);

  return {
    variantId: selected.id,
    stepIndex: session.current_step,
    difficulty: Number(selected.difficulty_score),
    promptMarkdown: selected.prompt_markdown,
    scenarioEntity: selected.scenario_entity,
    fixtureDdl: selected.fixture_ddl,
    totalQuestions: session.total_questions,
    remainingTimeSeconds: session.remaining_seconds,
  };
}

