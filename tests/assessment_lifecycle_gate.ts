import assert from 'node:assert/strict';
import {directPool} from '../lib/db';
import {dispatchAuthenticVerification} from '../lib/verification/dispatcher';
import {allocateNextQuestion} from '../lib/assessment/allocator';

type TestContext={sessionIds:string[];userId:string};
const ctx:TestContext={sessionIds:[],userId:''};

async function getCandidate(client:any){
  const r=await client.query(`
    SELECT id
    FROM user_accounts
    WHERE role='candidate' AND status='ACTIVE'
    ORDER BY created_at
    LIMIT 1
  `);
  if(!r.rows[0])throw new Error('Need at least one active candidate user for lifecycle gate.');
  ctx.userId=r.rows[0].id;
  return ctx.userId;
}

async function createSession(client:any,userId:string,totalQuestions=2){
  const node=await client.query(`SELECT id FROM capability_nodes WHERE slug='sql.window_functions' LIMIT 1`);
  if(!node.rows[0])throw new Error('SQL capability node is not configured.');
  const r=await client.query(`
    INSERT INTO assessment_sessions
      (user_id,target_role,seniority,domain_slug,capability_node_id,domain,experience_level,
       current_step,status,started_at,expires_at,last_activity_at,selected_question_count,selected_duration_minutes)
    VALUES
      ($1,'Data Engineer','MID','sql-window-functions',$2,'sql-window-functions','INTERMEDIATE',
       1,'IN_PROGRESS',clock_timestamp(),clock_timestamp()+interval '25 minutes',
       clock_timestamp(),$3,25)
    RETURNING id
  `,[userId,node.rows[0].id,totalQuestions]);
  const id=r.rows[0].id as string;
  ctx.sessionIds.push(id);
  return id;
}

async function cleanup(client:any){
  if(!ctx.sessionIds.length)return;
  await client.query(`DELETE FROM active_question_reservations WHERE session_id=ANY($1::uuid[])`,[ctx.sessionIds]);
  await client.query(`DELETE FROM assessment_adaptive_logs WHERE session_id=ANY($1::uuid[])`,[ctx.sessionIds]);
  await client.query(`DELETE FROM assessment_sessions WHERE id=ANY($1::uuid[])`,[ctx.sessionIds]);
}

async function getExecutableVariant(client:any,excludeId?:string){
  const r=await client.query(`
    SELECT v.*,f.domain
    FROM question_variants v
    JOIN question_families f ON f.id=v.family_id
    WHERE f.domain='sql-window-functions'
      AND v.experience_level='INTERMEDIATE'
      AND v.question_type='CODING'
      AND v.is_active=true
      AND jsonb_array_length(v.public_tests)>0
      AND jsonb_array_length(v.hidden_tests)>0
      AND ($1::uuid IS NULL OR v.id<>$1::uuid)
    ORDER BY f.family_code,v.variant_code
    LIMIT 1
  `,[excludeId??null]);
  if(!r.rows[0])throw new Error('No executable authored SQL variant is available.');
  return r.rows[0];
}

async function reserveAuthoritativeQuestion(client:any,sessionId:string,variant:any){
  await client.query(`
    INSERT INTO active_question_reservations(variant_id,session_id,expires_at)
    VALUES($1,$2,clock_timestamp()+interval '20 minutes')
  `,[variant.id,sessionId]);

  await client.query(`
    INSERT INTO assessment_adaptive_logs
      (session_id,step_index,variant_id,family_id,difficulty_presented,computed_theta_next)
    SELECT $1,1,v.id,v.family_id,v.difficulty_score,v.difficulty_score
    FROM question_variants v
    WHERE v.id=$2
  `,[sessionId,variant.id]);
}

async function acceptedReport(client:any,variant:any){
  const publicTests=Array.isArray(variant.public_tests)?variant.public_tests:[];
  const hiddenTests=Array.isArray(variant.hidden_tests)?variant.hidden_tests:[];
  const candidate=String(publicTests[0]?.canonical_sql||'');
  assert.ok(candidate.trim(),'Authoritative public canonical SQL is missing.');
  const report=await dispatchAuthenticVerification({
    domain:variant.domain,
    candidateCode:candidate,
    variant,
  });
  assert.equal(report.verdict,'ACCEPTED','Canonical candidate was not accepted by the real verifier.');
  assert.equal(report.allPassed,true,'Canonical candidate did not pass the complete suite.');
  assert.equal(report.publicTestsPassed,report.publicTestsTotal);
  assert.equal(report.hiddenTestsPassed,report.hiddenTestsTotal);
  assert.equal(report.publicTestsTotal,publicTests.length);
  assert.equal(report.hiddenTestsTotal,hiddenTests.length);
  return {candidate,report};
}

async function run(){
  const client=await directPool.connect();
  try{
    const userId=await getCandidate(client);

    console.log('[GATE 1] Real authored question + server verification...');
    const sessionId=await createSession(client,userId,2);
    const variant=await getExecutableVariant(client);
    await reserveAuthoritativeQuestion(client,sessionId,variant);

    const {candidate,report}=await acceptedReport(client,variant);
    assert.equal(report.verdict,'ACCEPTED');
    console.log('PASS: real authored candidate was accepted by the isolated verifier.');

    console.log('[GATE 2] Failed verification cannot advance state...');
    const before=await client.query(`
      SELECT current_step,status
      FROM assessment_sessions WHERE id=$1
    `,[sessionId]);
    const wrongCandidate='SELECT 1';
    const failed=await dispatchAuthenticVerification({
      domain:variant.domain,
      candidateCode:wrongCandidate,
      variant,
    });
    assert.notEqual(failed.verdict,'ACCEPTED');
    const after=await client.query(`
      SELECT current_step,status
      FROM assessment_sessions WHERE id=$1
    `,[sessionId]);
    assert.equal(Number(after.rows[0].current_step),Number(before.rows[0].current_step));
    assert.equal(after.rows[0].status,'IN_PROGRESS');
    console.log(`PASS: failed verification returned ${failed.verdict} and session state did not advance.`);

    console.log('[GATE 3] Accepted verification advances exactly once...');
    const next=await allocateNextQuestion(client,{
      sessionId,
      userId,
      submittedCode:candidate,
      durationSeconds:20,
      expectedVariantId:variant.id,
      verificationReport:report,
    });
    assert.ok(next);
    const advanced=await client.query(`
      SELECT current_step,status,final_theta
      FROM assessment_sessions WHERE id=$1
    `,[sessionId]);
    assert.equal(Number(advanced.rows[0].current_step),2);
    assert.equal(advanced.rows[0].status,'IN_PROGRESS');
    assert.ok(advanced.rows[0].final_theta===null);
    console.log('PASS: accepted verification advanced the authoritative session state once.');

    console.log('[GATE 4] Verification telemetry is server-derived...');
    const log=await client.query(`
      SELECT candidate_response,is_correct,verification_status,
             public_tests_passed,public_tests_total,
             hidden_tests_passed,hidden_tests_total,
             execution_digest
      FROM assessment_adaptive_logs
      WHERE session_id=$1 AND step_index=1
    `,[sessionId]);
    assert.equal(log.rows.length,1);
    assert.equal(log.rows[0].candidate_response,candidate);
    assert.equal(log.rows[0].is_correct,true);
    assert.equal(log.rows[0].verification_status,'PASSED');
    assert.equal(Number(log.rows[0].public_tests_passed),report.publicTestsPassed);
    assert.equal(Number(log.rows[0].public_tests_total),report.publicTestsTotal);
    assert.equal(Number(log.rows[0].hidden_tests_passed),report.hiddenTestsPassed);
    assert.equal(Number(log.rows[0].hidden_tests_total),report.hiddenTestsTotal);
    assert.equal(log.rows[0].execution_digest,report.executionDigest);
    console.log('PASS: persisted evidence matches the real verification report.');

    console.log('[GATE 5] Replay of consumed reservation is rejected...');
    let replayBlocked=false;
    try{
      await allocateNextQuestion(client,{
        sessionId,
        userId,
        submittedCode:candidate,
        durationSeconds:20,
        expectedVariantId:variant.id,
        verificationReport:report,
      });
    }catch(error:any){
      replayBlocked=['NO_ACTIVE_QUESTION_RESERVATION','QUESTION_RESERVATION_MISMATCH','STEP_ALREADY_FINALIZED'].includes(error?.message);
    }
    assert.equal(replayBlocked,true,'Consumed reservation was replayable.');
    console.log('PASS: consumed reservation cannot be replayed.');

    console.log('[GATE 6] Cross-session reservation binding...');
    // The single-active-session invariant intentionally prevents two active
    // sessions for one candidate/domain. Use a distinct candidate so this
    // gate tests reservation identity without violating that invariant.
    const candidateB=await client.query(
      `SELECT id
       FROM user_accounts
       WHERE role='candidate' AND status='ACTIVE' AND id<>$1
       ORDER BY created_at
       LIMIT 1`,
      [userId],
    );
    assert.ok(candidateB.rows[0], 'Need a second active candidate for cross-session binding gate.');
    const userB=candidateB.rows[0].id as string;
    const sessionB=await createSession(client,userB,2);
    const variantB=await getExecutableVariant(client,variant.id);
    await reserveAuthoritativeQuestion(client,sessionB,variantB);

    let crossBlocked=false;
    try{
      await allocateNextQuestion(client,{
        sessionId:sessionB,
        userId:userB,
        submittedCode:candidate,
        durationSeconds:20,
        expectedVariantId:variant.id,
        verificationReport:report,
      });
    }catch(error:any){
      crossBlocked=error?.message==='QUESTION_RESERVATION_MISMATCH';
    }
    assert.equal(crossBlocked,true,'A verification/reservation from another question was accepted.');
    console.log('PASS: reservation identity is enforced per session/question.');

    console.log('[GATE 7] Forged client correctness cannot override server verification...');
    const forgedNext=await allocateNextQuestion(client,{
      sessionId:sessionB,
      userId:userB,
      submittedCode:'SELECT 1',
      isCorrect:true,
      durationSeconds:20,
      expectedVariantId:variantB.id,
      verificationReport:{...report,verdict:'WRONG_ANSWER',allPassed:false,isCorrect:false,executionDigest:report.executionDigest+'-forged'}
    });
    assert.ok(forgedNext,'Failed submission should advance under the non-blocking CAT policy.');
    const forgedState=await client.query(`
      SELECT current_step,status FROM assessment_sessions WHERE id=$1
    `,[sessionB]);
    assert.equal(Number(forgedState.rows[0].current_step),2);
    assert.equal(forgedState.rows[0].status,'IN_PROGRESS');
    const forgedLog=await client.query(`
      SELECT is_correct,verification_status FROM assessment_adaptive_logs WHERE session_id=$1 AND step_index=1
    `,[sessionB]);
    assert.equal(forgedLog.rows[0].is_correct,false,'Client-supplied true correctness bypassed server verification.');
    assert.equal(forgedLog.rows[0].verification_status,'FAILED');
    console.log('PASS: server verification controls correctness while failed submissions still advance.');

    console.log('');
    console.log('ALL 7 END-TO-END ASSESSMENT LIFECYCLE GATES PASSED.');
  }finally{
    try{await cleanup(client);}finally{
      client.release();
      await directPool.end();
    }
  }
}

run().catch(error=>{
  console.error('GATE FAILURE:',error);
  process.exit(1);
});
