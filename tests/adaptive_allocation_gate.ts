import assert from 'node:assert/strict';
import {directPool} from '../lib/db';
import {allocateNextQuestion} from '../lib/assessment/allocator';

type GateContext={sessionIds:string[];userIds:string[]};
const ctx:GateContext={sessionIds:[],userIds:[]};

async function getTestUsers(client:any){
  const result=await client.query(`
    SELECT u.id
    FROM user_accounts u
    WHERE u.role='candidate'
      AND u.status='ACTIVE'
    ORDER BY (
      SELECT COUNT(*)
      FROM assessment_sessions s
      WHERE s.user_id=u.id
    ), u.created_at
    LIMIT 2
  `);
  if(result.rows.length<2)throw new Error('Need at least two active candidate users for adaptive gate.');
  const ids=result.rows.map((r:any)=>r.id as string);
  ctx.userIds.push(...ids);
  return ids;
}

async function initSession(client:any,userId:string){
  const node=await client.query(`SELECT id FROM capability_nodes WHERE slug='sql.window_functions' LIMIT 1`);
  if(!node.rows[0])throw new Error('SQL capability node is not configured.');
  const result=await client.query(`
    INSERT INTO assessment_sessions
      (user_id,target_role,seniority,domain_slug,capability_node_id,domain,experience_level,current_step,status,started_at,expires_at,last_activity_at)
    VALUES
      ($1,'Data Engineer','MID','sql-window-functions',$2,'sql','INTERMEDIATE',1,'IN_PROGRESS',
       clock_timestamp(),clock_timestamp()+interval '25 minutes',clock_timestamp())
    RETURNING id
  `,[userId,node.rows[0].id]);
  const id=result.rows[0].id as string;
  ctx.sessionIds.push(id);
  return id;
}

async function withTransaction(client:any,fn:()=>Promise<any>){
  await client.query('BEGIN');
  try{
    const result=await fn();
    await client.query('COMMIT');
    return result;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }
}

function acceptedReport(digest:string){
  return {
    verdict:'ACCEPTED',
    publicTestsPassed:2,
    publicTestsTotal:2,
    hiddenTestsPassed:2,
    hiddenTestsTotal:2,
    executionTimeMs:10,
    peakMemoryKb:null,
    executionDigest:digest,
    testCases:[],
  };
}

async function cleanup(client:any){
  if(!ctx.sessionIds.length)return;
  await client.query(`
    DELETE FROM active_question_reservations
    WHERE session_id=ANY($1::uuid[])
  `,[ctx.sessionIds]);
  await client.query(`
    DELETE FROM assessment_adaptive_logs
    WHERE session_id=ANY($1::uuid[])
  `,[ctx.sessionIds]);
  await client.query(`
    DELETE FROM assessment_sessions
    WHERE id=ANY($1::uuid[])
  `,[ctx.sessionIds]);
}

async function gateConcurrency(clientA:any,clientB:any,userA:string,userB:string){
  console.log('[GATE 1] True two-connection concurrency race...');
  const sessionA=await initSession(clientA,userA);
  const sessionB=await initSession(clientB,userB);
  const [allocA,allocB]=await Promise.all([
    withTransaction(clientA,()=>allocateNextQuestion(clientA,{sessionId:sessionA,userId:userA})),
    withTransaction(clientB,()=>allocateNextQuestion(clientB,{sessionId:sessionB,userId:userB})),
  ]);
  assert.ok(allocA&&allocB);
  assert.notEqual(allocA!.variantId,allocB!.variantId,'Concurrent allocations collided.');
  console.log('PASS: distinct variants reserved concurrently.');
  return {sessionA,allocA};
}

async function gateRefresh(client:any,userId:string,sessionId:string,variantId:string){
  console.log('[GATE 2] Idempotent resume...');
  const refresh=await allocateNextQuestion(client,{sessionId,userId});
  assert.ok(refresh);
  assert.equal(refresh!.variantId,variantId);
  assert.equal(refresh!.stepIndex,1);
  console.log('PASS: refresh preserved variant and step.');
}

async function gateDuplicate(client:any,userId:string,sessionId:string,variantId:string){
  console.log('[GATE 3] Double-submission protection...');
  await withTransaction(client,()=>allocateNextQuestion(client,{
    sessionId,userId,submittedCode:'SELECT 1;',isCorrect:true,durationSeconds:30,
    expectedVariantId:variantId,verificationReport:acceptedReport('gate-duplicate')
  }));
  let blocked=false;
  try{
    await allocateNextQuestion(client,{
      sessionId,userId,submittedCode:'SELECT 1;',isCorrect:true,durationSeconds:30,
      expectedVariantId:variantId,verificationReport:acceptedReport('gate-duplicate-2')
    });
  }catch(error:any){
    blocked=['NO_ACTIVE_QUESTION_RESERVATION','QUESTION_RESERVATION_MISMATCH','STEP_ALREADY_FINALIZED'].includes(error?.message);
  }
  assert.equal(blocked,true,'Duplicate submission was accepted.');
  console.log('PASS: duplicate submission rejected.');
}

async function gateCeiling(client:any,userId:string){
  console.log('[GATE 4] Ceiling clamp <= 7.0...');
  const sessionId=await initSession(client,userId);
  let question=await allocateNextQuestion(client,{sessionId,userId});
  assert.ok(question);
  for(let i=0;i<8&&question;i++){
    question=await withTransaction(client,()=>allocateNextQuestion(client,{
      sessionId,userId,submittedCode:`CEILING-${i}`,isCorrect:true,durationSeconds:20,
      expectedVariantId:question!.variantId,verificationReport:acceptedReport(`gate-ceiling-${i}`)
    }));
  }
  const result=await client.query(`
    SELECT MAX(difficulty_presented) AS max_presented,MAX(computed_theta_next) AS max_theta
    FROM assessment_adaptive_logs WHERE session_id=$1
  `,[sessionId]);
  assert.ok(Number(result.rows[0].max_presented)<=7.0);
  assert.ok(Number(result.rows[0].max_theta)<=7.0);
  console.log('PASS: ceiling bounded at 7.0.');
}

async function gateFloor(client:any,userId:string){
  console.log('[GATE 5] Failed verification cannot mutate adaptive state...');
  const sessionId=await initSession(client,userId);
  const question=await allocateNextQuestion(client,{sessionId,userId});
  assert.ok(question);
  let blocked=false;
  try{
    await withTransaction(client,()=>allocateNextQuestion(client,{
      sessionId,userId,submittedCode:'FLOOR-FAILED',isCorrect:true,durationSeconds:300,
      expectedVariantId:question!.variantId,
      verificationReport:{
        ...acceptedReport('gate-floor-failed'),
        verdict:'WRONG_ANSWER',
        publicTestsPassed:0,
        hiddenTestsPassed:0
      }
    }));
  }catch(error:any){
    blocked=error?.message==='VERIFICATION_FAILED_NO_ADVANCE';
  }
  assert.equal(blocked,true,'Failed verification was allowed to advance adaptive state.');
  const state=await client.query(`
    SELECT current_step,status FROM assessment_sessions WHERE id=$1
  `,[sessionId]);
  const log=await client.query(`
    SELECT candidate_response,is_correct,verification_status
    FROM assessment_adaptive_logs
    WHERE session_id=$1 AND step_index=1
  `,[sessionId]);
  assert.equal(Number(state.rows[0].current_step),1);
  assert.equal(state.rows[0].status,'IN_PROGRESS');
  assert.equal(log.rows.length,1);
  assert.equal(log.rows[0].candidate_response,null);
  console.log('PASS: failed verification left adaptive state untouched.');
}

async function gateServerAuthority(client:any,userId:string){
  console.log('[GATE 6] Server-authoritative level...');
  const sessionId=await initSession(client,userId);
  const question=await allocateNextQuestion(client,{sessionId,userId});
  assert.ok(question);
  assert.ok(question!.difficulty>=4.1&&question!.difficulty<=7.0);
  console.log('PASS: DB session/config state controls allocation.');
}

async function gateHistorical(client:any,userId:string){
  console.log('[GATE 7] Historical variant uniqueness...');
  const firstSession=await initSession(client,userId);
  const first=await allocateNextQuestion(client,{sessionId:firstSession,userId});
  assert.ok(first);
  await withTransaction(client,()=>allocateNextQuestion(client,{
    sessionId:firstSession,userId,submittedCode:'HISTORICAL-1',isCorrect:true,
    durationSeconds:30,expectedVariantId:first!.variantId,
    verificationReport:acceptedReport('gate-history-1')
  }));
  const secondSession=await initSession(client,userId);
  const second=await allocateNextQuestion(client,{sessionId:secondSession,userId});
  assert.ok(second);
  assert.notEqual(second!.variantId,first!.variantId,'Historical variant was re-served.');
  const seen=await client.query(`
    SELECT 1
    FROM assessment_adaptive_logs l
    JOIN assessment_sessions s ON s.id=l.session_id
    WHERE s.user_id=$1 AND l.variant_id=$2 AND s.id<>$3
    LIMIT 1
  `,[userId,second!.variantId,secondSession]);
  assert.equal(seen.rows.length,0,'Allocator served a variant already seen by this candidate.');
  console.log('PASS: historical variant excluded.');
}

async function gateExpiry(client:any,userId:string){
  console.log('[GATE 8] Time-bound expiration...');
  const sessionId=await initSession(client,userId);
  await client.query(`
    UPDATE assessment_sessions
    SET started_at=clock_timestamp()-interval '30 minutes'
    WHERE id=$1
  `,[sessionId]);
  const result=await allocateNextQuestion(client,{sessionId,userId});
  const status=await client.query(`SELECT status FROM assessment_sessions WHERE id=$1`,[sessionId]);
  assert.equal(result,null);
  assert.equal(status.rows[0].status,'EXPIRED');
  console.log('PASS: expired session closed and returned null.');
}

async function gateAcceptedTelemetry(client:any,userId:string){
  console.log('[GATE 9] Accepted verification advances once and records evidence telemetry...');
  const sessionId=await initSession(client,userId);
  const question=await allocateNextQuestion(client,{sessionId,userId});
  assert.ok(question);
  const next=await withTransaction(client,()=>allocateNextQuestion(client,{
    sessionId,userId,submittedCode:'SELECT 1;',isCorrect:true,durationSeconds:20,
    expectedVariantId:question!.variantId,
    verificationReport:{
      verdict:'ACCEPTED',
      publicTestsPassed:3,
      publicTestsTotal:3,
      hiddenTestsPassed:3,
      hiddenTestsTotal:3,
      executionTimeMs:17.25,
      peakMemoryKb:null,
      executionDigest:'gate-accepted-telemetry',
      testCases:[]
    }
  }));
  assert.ok(next);
  const session=await client.query(`SELECT current_step FROM assessment_sessions WHERE id=$1`,[sessionId]);
  const log=await client.query(`
    SELECT candidate_response,is_correct,verification_status,
           public_tests_passed,public_tests_total,
           hidden_tests_passed,hidden_tests_total,
           execution_time_ms,peak_memory_kb,execution_digest
    FROM assessment_adaptive_logs
    WHERE session_id=$1 AND step_index=1
  `,[sessionId]);
  assert.equal(Number(session.rows[0].current_step),2);
  assert.equal(log.rows.length,1);
  assert.equal(log.rows[0].candidate_response,'SELECT 1;');
  assert.equal(log.rows[0].is_correct,true);
  assert.equal(log.rows[0].verification_status,'PASSED');
  assert.equal(Number(log.rows[0].public_tests_passed),3);
  assert.equal(Number(log.rows[0].public_tests_total),3);
  assert.equal(Number(log.rows[0].hidden_tests_passed),3);
  assert.equal(Number(log.rows[0].hidden_tests_total),3);
  assert.equal(Number(log.rows[0].execution_time_ms),17.25);
  assert.equal(log.rows[0].peak_memory_kb,null);
  assert.equal(log.rows[0].execution_digest,'gate-accepted-telemetry');
  console.log('PASS: accepted verification advanced once and persisted telemetry.');
}

async function run(){
  const clientA=await directPool.connect();
  const clientB=await directPool.connect();
  try{
    const [userA,userB]=await getTestUsers(clientA);
    const {sessionA,allocA}=await gateConcurrency(clientA,clientB,userA,userB);
    await gateRefresh(clientA,userA,sessionA,allocA!.variantId);
    await gateDuplicate(clientA,userA,sessionA,allocA!.variantId);
    await gateCeiling(clientA,userA);
    await gateFloor(clientA,userB);
    await gateServerAuthority(clientA,userA);
    await gateHistorical(clientA,userA);
    await gateExpiry(clientA,userB);
    await gateAcceptedTelemetry(clientA,userA);
    console.log('');
    console.log('ALL 9 ADAPTIVE STATE-MACHINE AND VERIFICATION-BOUNDARY GATES PASSED.');
  }finally{
    try{await cleanup(clientA);}finally{
      clientA.release();
      clientB.release();
      await directPool.end();
    }
  }
}

run().catch(error=>{
  console.error('GATE FAILURE:',error);
  process.exit(1);
});
