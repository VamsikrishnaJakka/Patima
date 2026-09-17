import crypto from 'node:crypto';
import {NextResponse} from 'next/server';
import {getAssessment} from '@/lib/assessment-catalog';
import {consultEvidenceCoach} from '@/lib/agents/evidence-coach';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';
import {verifyAssessment} from '@/lib/assessment-verifier';
import {verifyCandidateSqlIsolated} from '@/lib/verification/duckdb-engine';

type SubmittedAnswer={probe:number;answer:string};

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const sessionId=typeof body.sessionId==='string'?body.sessionId:'';
  const answers=Array.isArray(body.answers)?body.answers:[];
  const events=Array.isArray(body.workspaceEvents)?body.workspaceEvents:[];
  if(!sessionId||answers.length!==3)return NextResponse.json({error:'Exactly three probe responses are required'},{status:400});
  if(events.length>200)return NextResponse.json({error:'Workspace telemetry limit exceeded'},{status:400});

  const normalizedAnswers:SubmittedAnswer[]=answers.map((a:any)=>({probe:Number(a.probe),answer:typeof a.answer==='string'?a.answer.slice(0,12000):''}));
  const uniqueProbes=new Set(normalizedAnswers.map((a:SubmittedAnswer)=>a.probe));
  if(uniqueProbes.size!==3||[1,2,3].some(n=>!uniqueProbes.has(n)))throw new Error('INVALID_PROBE_SET');

  const sessionContext=await withAuthenticatedClient(async(s,client)=>{
   const current=await client.query(`SELECT a.*,cn.slug capability_slug FROM assessment_sessions a JOIN capability_nodes cn ON cn.id=a.capability_node_id WHERE a.id=$1 AND a.user_id=$2 AND a.status='IN_PROGRESS' FOR UPDATE`,[sessionId,s.userId]);
   const row=current.rows[0];
   if(!row)throw new Error('ASSESSMENT_NOT_FOUND');
   if(row.expires_at&&new Date(row.expires_at).getTime()<=Date.now()){
    await client.query(`UPDATE assessment_sessions SET status='EXPIRED',updated_at=clock_timestamp() WHERE id=$1`,[sessionId]);throw new Error('ASSESSMENT_EXPIRED');
   }
   const assessment=getAssessment(row.domain_slug);if(!assessment)throw new Error('ASSESSMENT_UNAVAILABLE');
   return {userId:s.userId,sessionId,assessment,row};
  });

  const textual=verifyAssessment(sessionContext.assessment,normalizedAnswers);
  let outcome=textual.outcome;
  let astAnalysis:null|ReturnType<typeof verifyCandidateSqlIsolated>['astValidation']=null;
  let executionResults:Awaited<ReturnType<typeof verifyCandidateSqlIsolated>>|null=null;
  const candidateSql=sessionContext.assessment.slug==='sql-window-functions'?normalizedAnswers.map((a:SubmittedAnswer)=>a.answer).find((a:string)=>/\b(?:select|with)\b/i.test(a)&&/\buser_events\b/i.test(a))||'':'';

  if(sessionContext.assessment.slug==='sql-window-functions'){
   if(!candidateSql)outcome='DEVELOPING';
   else{
    executionResults=await verifyCandidateSqlIsolated(candidateSql);
    astAnalysis=executionResults.astValidation;
    if(executionResults.allPassed&&textual.outcome==='DEMONSTRATED')outcome='DEMONSTRATED';
    else if(textual.outcome==='DEMONSTRATED')outcome='PROVISIONAL';
   }
  }

  const sandboxVerified=Boolean(executionResults?.allPassed&&outcome==='DEMONSTRATED');
  const verificationTier=sandboxVerified?'SANDBOX_REPRODUCED':'CLIENT_EVALUATED';
  const artifactSha=candidateSql?crypto.createHash('sha256').update(candidateSql).digest('hex'):null;
  const safeEvents=events.slice(-200).map((e:any)=>({type:typeof e.type==='string'?e.type.slice(0,40):'UNKNOWN',at:typeof e.at==='string'?e.at:null}));
  const coach=await consultEvidenceCoach({
   status:outcome,
   domain:sessionContext.assessment.capabilityName,
   astViolations:astAnalysis?.detectedViolations||[],
   failedAssertions:executionResults?.assertions.filter(a=>!a.passed).map(a=>a.name)||[],
   candidateReasoning:normalizedAnswers.find(a=>a.probe===2)?.answer||'',
   executionDurationMs:executionResults?.assertions[0]?.durationMs||0,
  });

  const result=await withAuthenticatedClient(async(s,client)=>{
   const current=await client.query(`SELECT a.*,cn.slug capability_slug FROM assessment_sessions a JOIN capability_nodes cn ON cn.id=a.capability_node_id WHERE a.id=$1 AND a.user_id=$2 AND a.status='IN_PROGRESS' FOR UPDATE`,[sessionId,s.userId]);
   const row=current.rows[0];
   if(!row)throw new Error('ASSESSMENT_NOT_FOUND');
   if(row.expires_at&&new Date(row.expires_at).getTime()<=Date.now())throw new Error('ASSESSMENT_EXPIRED');
   const assessment=getAssessment(row.domain_slug);if(!assessment)throw new Error('ASSESSMENT_UNAVAILABLE');
   await client.query(`UPDATE assessment_sessions SET status='VERIFIED',current_probe=3,answers=$2::jsonb,workspace_events=$3::jsonb,outcome=$4,submitted_at=clock_timestamp(),last_activity_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,[sessionId,JSON.stringify(normalizedAnswers),JSON.stringify(safeEvents),outcome]);
   if(executionResults){
    const sqlProbe=normalizedAnswers.find((a:SubmittedAnswer)=>a.answer===candidateSql)?.probe||1;
    await client.query(`INSERT INTO assessment_execution_runs(session_id,probe_index,submitted_code,ast_tree,assertions_passed,assertions_total,execution_time_ms,output_hash) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,[sessionId,sqlProbe,candidateSql,JSON.stringify(executionResults.astValidation.astFingerprint),executionResults.assertions.filter(a=>a.passed).length,executionResults.assertions.length,executionResults.assertions[0]?.durationMs||0,executionResults.executionDigest]);
   }
   const evidence=await client.query(`INSERT INTO evidence_records(assessment_session_id,user_id,capability_node_id,verification_tier,summary,context,artifact_code,test_trace,ast_fingerprint,behavioral_assertions,execution_trace_digest,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12) RETURNING id`,[
    sessionId,s.userId,row.capability_node_id,verificationTier,
    `${assessment.title}: ${outcome} across ${textual.passed}/3 calibrated probes.`,
    `Target role: ${row.target_role}; seniority: ${row.seniority}; server-side multi-probe verification with workspace-scoped telemetry.${sandboxVerified?' SQL AST allowlist and isolated DuckDB execution passed.':candidateSql?' SQL isolated verification was attempted but did not establish independent reproduction.':''}`,
    normalizedAnswers.map((a:SubmittedAnswer)=>`Probe ${a.probe}\n${a.answer}`).join('\n\n'),JSON.stringify(textual.evaluations),astAnalysis?JSON.stringify(astAnalysis.astFingerprint):null,executionResults?JSON.stringify(executionResults.assertions):null,executionResults?.executionDigest||null,artifactSha]);
   await client.query(`INSERT INTO user_capability_states(user_id,capability_node_id,state,last_demonstrated_at,last_observed_at,evidence_count) VALUES($1,$2,$3,CASE WHEN $3='DEMONSTRATED' THEN clock_timestamp() ELSE NULL END,clock_timestamp(),1) ON CONFLICT(user_id,capability_node_id) DO UPDATE SET state=CASE WHEN $3='DEMONSTRATED' THEN 'DEMONSTRATED' WHEN user_capability_states.state='DEMONSTRATED' THEN user_capability_states.state ELSE $3 END,last_demonstrated_at=CASE WHEN $3='DEMONSTRATED' THEN clock_timestamp() ELSE user_capability_states.last_demonstrated_at END,last_observed_at=clock_timestamp(),evidence_count=user_capability_states.evidence_count+1`,[s.userId,row.capability_node_id,outcome]);
   return {outcome,passed:textual.passed,evaluations:textual.evaluations,capability:assessment.capabilityName,evidenceId:evidence.rows[0].id,verificationTier,astAnalysis,execution:executionResults?{allPassed:executionResults.allPassed,executionDigest:executionResults.executionDigest,assertions:executionResults.assertions}:null,coach};
  });
  return NextResponse.json(result);
 }catch(error){
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  const status=message==='UNAUTHORIZED'?401:message==='ASSESSMENT_NOT_FOUND'||message==='ASSESSMENT_EXPIRED'?404:message==='INVALID_PROBE_SET'?400:500;
  return NextResponse.json({error:status===401?'Unauthorized':status===404?'Assessment session not found, expired, or already submitted':status===400?'Exactly one response for each of the three probes is required':'Unable to verify assessment'},{status});
 }
}
