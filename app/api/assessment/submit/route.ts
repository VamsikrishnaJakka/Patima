import {NextResponse} from 'next/server';
import {getAssessment} from '@/lib/assessment-catalog';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9+.#_ -]/g,' ');
const matches=(text:string,term:string)=>normalize(text).includes(normalize(term));

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const sessionId=typeof body.sessionId==='string'?body.sessionId:'';
  const answers=Array.isArray(body.answers)?body.answers:[];
  const events=Array.isArray(body.workspaceEvents)?body.workspaceEvents:[];
  if(!sessionId||answers.length!==3)return NextResponse.json({error:'Exactly three probe responses are required'},{status:400});
  if(events.length>200)return NextResponse.json({error:'Workspace telemetry limit exceeded'},{status:400});

  const result=await withAuthenticatedClient(async(s,client)=>{
   const current=await client.query(`SELECT a.*,cn.slug capability_slug FROM assessment_sessions a JOIN capability_nodes cn ON cn.id=a.capability_node_id WHERE a.id=$1 AND a.user_id=$2 AND a.status='IN_PROGRESS' FOR UPDATE`,[sessionId,s.userId]);
   const row=current.rows[0]; if(!row)throw new Error('ASSESSMENT_NOT_FOUND');
   const assessment=getAssessment(row.domain_slug); if(!assessment)throw new Error('ASSESSMENT_UNAVAILABLE');
   const normalizedAnswers=answers.map((a:any)=>({probe:Number(a.probe),answer:typeof a.answer==='string'?a.answer.slice(0,12000):''}));
   const evaluations=assessment.probes.map(probe=>{
    const answer=normalizedAnswers.find((a:any)=>a.probe===probe.number)?.answer||'';
    const hits=probe.required.filter(term=>matches(answer,term));
    return {probe:probe.number,required:probe.required.length,covered:hits.length,passed:hits.length>=Math.ceil(probe.required.length*0.67)};
   });
   const passed=evaluations.filter(x=>x.passed).length;
   const outcome=passed===3?'DEMONSTRATED':passed===2?'PROVISIONAL':'DEVELOPING';
   const safeEvents=events.slice(-200).map((e:any)=>({type:typeof e.type==='string'?e.type.slice(0,40):'UNKNOWN',at:typeof e.at==='string'?e.at:null}));
   await client.query(`UPDATE assessment_sessions SET status='VERIFIED',current_probe=3,answers=$2::jsonb,workspace_events=$3::jsonb,outcome=$4,submitted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,[sessionId,JSON.stringify(normalizedAnswers),JSON.stringify(safeEvents),outcome]);
   await client.query(`INSERT INTO evidence_records(user_id,capability_node_id,verification_tier,summary,context,artifact_code,test_trace) VALUES($1,$2,'CLIENT_EVALUATED',$3,$4,$5,$6::jsonb)`,[s.userId,row.capability_node_id,`${assessment.title}: ${outcome} across ${passed}/3 calibrated probes.`,`Target role: ${row.target_role}; seniority: ${row.seniority}; multi-probe verification with workspace-scoped telemetry.`,normalizedAnswers.map((a:any)=>`Probe ${a.probe}\n${a.answer}`).join('\n\n'),JSON.stringify(evaluations)]);
   await client.query(`INSERT INTO user_capability_states(user_id,capability_node_id,state,last_demonstrated_at,last_observed_at,evidence_count) VALUES($1,$2,$3,CASE WHEN $3='DEMONSTRATED' THEN clock_timestamp() ELSE NULL END,clock_timestamp(),1) ON CONFLICT(user_id,capability_node_id) DO UPDATE SET state=CASE WHEN $3='DEMONSTRATED' THEN 'DEMONSTRATED' WHEN user_capability_states.state='DEMONSTRATED' THEN user_capability_states.state ELSE $3 END,last_demonstrated_at=CASE WHEN $3='DEMONSTRATED' THEN clock_timestamp() ELSE user_capability_states.last_demonstrated_at END,last_observed_at=clock_timestamp(),evidence_count=user_capability_states.evidence_count+1`,[s.userId,row.capability_node_id,outcome]);
   return {outcome,passed,evaluations,capability:assessment.capabilityName};
  });
  return NextResponse.json(result);
 }catch(error){
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  const status=message==='UNAUTHORIZED'?401:message==='ASSESSMENT_NOT_FOUND'?404:500;
  return NextResponse.json({error:status===401?'Unauthorized':status===404?'Assessment session not found or already submitted':'Unable to verify assessment'},{status});
 }
}
