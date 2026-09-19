import assert from 'node:assert/strict';
import {directPool} from '../lib/db';
import {dispatchAuthenticVerification} from '../lib/verification/dispatcher';
import {allocateNextQuestion} from '../lib/assessment/allocator';

const createdSessions:string[]=[];

async function pickCandidate(client:any){
  const r=await client.query(`
    SELECT u.id
    FROM user_accounts u
    WHERE u.role='candidate' AND u.status='ACTIVE'
    ORDER BY (
      SELECT COUNT(*) FROM assessment_sessions s WHERE s.user_id=u.id
    ),u.created_at
    LIMIT 1
  `);
  if(!r.rows[0])throw new Error('SECURITY_GATE_NEEDS_ACTIVE_CANDIDATE');
  return r.rows[0].id as string;
}

async function createSession(client:any,userId:string){
  const node=await client.query(`SELECT id FROM capability_nodes WHERE slug='sql.window_functions' LIMIT 1`);
  if(!node.rows[0])throw new Error('SECURITY_GATE_SQL_CAPABILITY_MISSING');
  const r=await client.query(`
    INSERT INTO assessment_sessions
      (user_id,target_role,seniority,domain_slug,capability_node_id,domain,experience_level,current_step,status,started_at,expires_at,last_activity_at)
    VALUES($1,'Data Engineer','MID','sql-window-functions',$2,'sql','INTERMEDIATE',1,'IN_PROGRESS',
           clock_timestamp(),clock_timestamp()+interval '25 minutes',clock_timestamp())
    RETURNING id
  `,[userId,node.rows[0].id]);
  createdSessions.push(r.rows[0].id);
  return r.rows[0].id as string;
}

async function getVariant(client:any){
  const r=await client.query(`
    SELECT v.*,f.domain
    FROM question_variants v
    JOIN question_families f ON f.id=v.family_id
    WHERE f.domain='sql-window-functions'
      AND v.experience_level='INTERMEDIATE'
      AND v.is_active=TRUE
      AND jsonb_array_length(COALESCE(v.public_tests,'[]'::jsonb))+
          jsonb_array_length(COALESCE(v.hidden_tests,'[]'::jsonb))>0
    ORDER BY v.exposure_count ASC
    LIMIT 1
  `);
  if(!r.rows[0])throw new Error('SECURITY_GATE_NO_AUTHORED_SQL_VARIANT');
  return r.rows[0];
}

async function reserveVariant(client:any,userId:string,sessionId:string,variantId:string){
  const q=await client.query(`
    SELECT v.*,f.domain
    FROM question_variants v
    JOIN question_families f ON f.id=v.family_id
    WHERE v.id=$1
  `,[variantId]);
  if(!q.rows[0])throw new Error('SECURITY_GATE_VARIANT_MISSING');
  await client.query(`
    INSERT INTO active_question_reservations(variant_id,session_id,expires_at)
    VALUES($1,$2,clock_timestamp()+interval '10 minutes')
  `,[variantId,sessionId]);
  await client.query(`
    INSERT INTO assessment_adaptive_logs(session_id,step_index,variant_id,family_id,difficulty_presented,computed_theta_next)
    VALUES($1,1,$2,$3,$4,$4)
  `,[sessionId,variantId,q.rows[0].family_id,q.rows[0].difficulty_score]);
  return q.rows[0];
}

async function cleanup(client:any){
  if(!createdSessions.length)return;
  await client.query(`DELETE FROM active_question_reservations WHERE session_id=ANY($1::uuid[])`,[createdSessions]);
  await client.query(`DELETE FROM assessment_adaptive_logs WHERE session_id=ANY($1::uuid[])`,[createdSessions]);
  await client.query(`DELETE FROM assessment_sessions WHERE id=ANY($1::uuid[])`,[createdSessions]);
}

async function run(){
  const client=await directPool.connect();
  try{
    const userId=await pickCandidate(client);
    const variant=await getVariant(client);

    console.log('[SECURITY 1] Disabled verification tracks cannot execute...');
    await assert.rejects(
      dispatchAuthenticVerification({domain:'python',candidateCode:'print(1)',variant}),
      /TRACK_DISABLED_PENDING_ISOLATED_HARNESS/
    );
    console.log('PASS: non-isolated track remains disabled.');

    console.log('[SECURITY 2] Authored executable suite is mandatory...');
    await assert.rejects(
      dispatchAuthenticVerification({
        domain:'sql-window-functions',
        candidateCode:variant.public_tests?.[0]?.canonical_sql||'SELECT 1',
        variant:{...variant,public_tests:[],hidden_tests:[]}
      }),
      /NO_AUTHORED_TEST_CASES_CONFIGURED_FOR_VARIANT/
    );
    console.log('PASS: empty authored suite is rejected.');

    const canonical=String(variant.public_tests?.[0]?.canonical_sql||'');
    if(!canonical.trim())throw new Error('SECURITY_GATE_VARIANT_HAS_NO_CANONICAL_PUBLIC_SQL');

    console.log('[SECURITY 3] Wrong candidate solution cannot become ACCEPTED...');
    const wrong=await dispatchAuthenticVerification({
      domain:'sql-window-functions',
      candidateCode:'SELECT 1;',
      variant
    });
    assert.notEqual(wrong.verdict,'ACCEPTED');
    assert.equal(wrong.allPassed,false);
    console.log(`PASS: wrong solution returned ${wrong.verdict}.`);

    console.log('[SECURITY 4] Authored suite is executable and server-verifiable...');
    const accepted=await dispatchAuthenticVerification({
      domain:'sql-window-functions',
      candidateCode:canonical,
      variant
    });
    if(accepted.verdict!=='ACCEPTED'){
      console.error('SECURITY 4 DIAGNOSTIC:');
      console.error(JSON.stringify({
        verdict:accepted.verdict,
        allPassed:accepted.allPassed,
        firstFailingTestCase:accepted.firstFailingTestCase,
        testCases:accepted.testCases,
        publicTestsPassed:accepted.publicTestsPassed,
        publicTestsTotal:accepted.publicTestsTotal,
        hiddenTestsPassed:accepted.hiddenTestsPassed,
        hiddenTestsTotal:accepted.hiddenTestsTotal,
        executionTimeMs:accepted.executionTimeMs,
        executionDigest:accepted.executionDigest
      },null,2));
    }
    assert.equal(accepted.verdict,'ACCEPTED');
    assert.equal(accepted.allPassed,true);
    assert.ok(accepted.executionDigest);
    assert.equal(accepted.peakMemoryKb,null);
    assert.ok(accepted.publicTestsTotal>0);
    console.log('PASS: authored candidate passed public and hidden execution.');

    console.log('[SECURITY 5] Verification evidence is bound to candidate code...');
    const mutated=await dispatchAuthenticVerification({
      domain:'sql-window-functions',
      candidateCode:canonical+'\n-- PATIMA SECURITY MUTATION',
      variant
    });
    assert.notEqual(mutated.executionDigest,accepted.executionDigest);
    console.log('PASS: mutated candidate receives a different execution digest.');

    console.log('[SECURITY 6] Client cannot advance without verification evidence...');
    const session=await createSession(client,userId);
    const allocated=await allocateNextQuestion(client,{sessionId:session,userId});
    assert.ok(allocated);
    await assert.rejects(
      allocateNextQuestion(client,{
        sessionId:session,userId,submittedCode:canonical,isCorrect:true,
        expectedVariantId:allocated!.variantId
      }),
      /VERIFICATION_REQUIRED_BEFORE_ADVANCE/
    );
    const state=await client.query(`SELECT current_step,status FROM assessment_sessions WHERE id=$1`,[session]);
    assert.equal(Number(state.rows[0].current_step),1);
    assert.equal(state.rows[0].status,'IN_PROGRESS');
    console.log('PASS: no verification evidence means no adaptive advancement.');

    console.log('[SECURITY 7] Failed server verification cannot advance...');
    const failedSession=await createSession(client,userId);
    const failedQuestion=await allocateNextQuestion(client,{sessionId:failedSession,userId});
    assert.ok(failedQuestion);
    await assert.rejects(
      allocateNextQuestion(client,{
        sessionId:failedSession,userId,submittedCode:'SELECT 1;',isCorrect:true,
        expectedVariantId:failedQuestion!.variantId,
        verificationReport:{...accepted,verdict:'WRONG_ANSWER'}
      }),
      /VERIFICATION_FAILED_NO_ADVANCE/
    );
    console.log('PASS: failed verification cannot advance.');

    console.log('[SECURITY 8] Verification cannot be replayed against a different reservation...');
    const replaySession=await createSession(client,userId);
    const replayQuestion=await allocateNextQuestion(client,{sessionId:replaySession,userId});
    assert.ok(replayQuestion);
    const otherSession=await createSession(client,userId);
    const otherQuestion=await allocateNextQuestion(client,{sessionId:otherSession,userId});
    assert.ok(otherQuestion);
    await assert.rejects(
      allocateNextQuestion(client,{
        sessionId:otherSession,userId,submittedCode:canonical,isCorrect:true,
        expectedVariantId:replayQuestion!.variantId,verificationReport:accepted
      }),
      /QUESTION_RESERVATION_MISMATCH|NO_ACTIVE_QUESTION_RESERVATION/
    );
    console.log('PASS: verification cannot be replayed against another reservation.');

    console.log('[SECURITY 9] Reservation expiry blocks submission...');
    const expirySession=await createSession(client,userId);
    const expiryQuestion=await allocateNextQuestion(client,{sessionId:expirySession,userId});
    assert.ok(expiryQuestion);
    await client.query(`
      UPDATE active_question_reservations
      SET expires_at=clock_timestamp()-interval '1 second'
      WHERE session_id=$1
    `,[expirySession]);
    await assert.rejects(
      allocateNextQuestion(client,{
        sessionId:expirySession,userId,submittedCode:canonical,isCorrect:true,
        expectedVariantId:expiryQuestion!.variantId,verificationReport:accepted
      }),
      /NO_ACTIVE_QUESTION_RESERVATION/
    );
    console.log('PASS: expired reservation cannot be submitted.');

    console.log('[SECURITY 10] Accepted verification is the only success condition...');
    const finalSession=await createSession(client,userId);
    const finalQuestion=await allocateNextQuestion(client,{sessionId:finalSession,userId});
    assert.ok(finalQuestion);
    const next=await allocateNextQuestion(client,{
      sessionId:finalSession,userId,submittedCode:canonical,isCorrect:false,
      expectedVariantId:finalQuestion!.variantId,verificationReport:accepted
    });
    assert.ok(next);
    const finalLog=await client.query(`
      SELECT is_correct,verification_status,execution_digest
      FROM assessment_adaptive_logs
      WHERE session_id=$1 AND step_index=1
    `,[finalSession]);
    assert.equal(finalLog.rows[0].is_correct,true);
    assert.equal(finalLog.rows[0].verification_status,'PASSED');
    assert.equal(finalLog.rows[0].execution_digest,accepted.executionDigest);
    console.log('PASS: server ACCEPTED evidence controls the successful adaptive transition.');

    console.log('');
    console.log('ALL 10 VERIFICATION SECURITY GATES PASSED.');
  }finally{
    try{await cleanup(client)}finally{
      client.release();
      await directPool.end();
    }
  }
}

run().catch(error=>{
  console.error('SECURITY GATE FAILURE:',error);
  process.exit(1);
});
