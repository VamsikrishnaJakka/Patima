import {NextResponse} from 'next/server';
import {getAssessment} from '@/lib/assessment-catalog';
import {allocateNextQuestion} from '@/lib/assessment/allocator';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

function evaluateAnswer(answer:string,prompt:string){
 const text=answer.toLowerCase();
 if(text.trim().length<80)return false;
 const terms=prompt.toLowerCase().includes('window')?['partition','order','lag','frame']:['explain','concurr','boundary'];
 const hits=terms.filter(x=>text.includes(x)).length;
 return hits>=Math.min(3,terms.length);
}

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const sessionId=typeof body.sessionId==='string'?body.sessionId:'';
  const answer=typeof body.answer==='string'?body.answer.slice(0,12000):'';
  const variantId=typeof body.variantId==='string'?body.variantId:'';
  const durationSeconds=Math.max(1,Number(body.durationSeconds)||60);
  if(!sessionId||!variantId||!answer.trim())return NextResponse.json({error:'Session, question, and answer are required'},{status:400});

  const result=await withAuthenticatedClient(async(s,client)=>{
   const active=await client.query(`SELECT v.id,v.prompt_markdown FROM active_question_reservations r JOIN question_variants v ON v.id=r.variant_id WHERE r.session_id=$1 AND r.expires_at>clock_timestamp() FOR UPDATE`,[sessionId]);
   if(!active.rows[0])throw new Error('NO_ACTIVE_QUESTION_RESERVATION');
   if(active.rows[0].id!==variantId)throw new Error('QUESTION_RESERVATION_MISMATCH');
   const isCorrect=evaluateAnswer(answer,active.rows[0].prompt_markdown);
   const next=await allocateNextQuestion(client,{sessionId,userId:s.userId,submittedCode:answer,isCorrect,durationSeconds,expectedVariantId:variantId});
   if(next)return {completed:false,isCorrect,next};
   const row=await client.query(`SELECT a.outcome,a.final_theta,a.domain_slug,a.target_role,a.seniority,a.capability_node_id,cn.name capability FROM assessment_sessions a JOIN capability_nodes cn ON cn.id=a.capability_node_id WHERE a.id=$1 AND a.user_id=$2`,[sessionId,s.userId]);
   const r=row.rows[0];
   if(!r)throw new Error('ASSESSMENT_NOT_FOUND');
   const logs=await client.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE is_correct)::int correct FROM assessment_adaptive_logs WHERE session_id=$1`,[sessionId]);
   const total=logs.rows[0].total,correct=logs.rows[0].correct;
   const outcome=correct/Math.max(1,total)>=0.7?'DEMONSTRATED':correct/Math.max(1,total)>=0.4?'PROVISIONAL':'DEVELOPING';
   await client.query(`UPDATE assessment_sessions SET outcome=$1, status='VERIFIED', submitted_at=COALESCE(submitted_at,clock_timestamp()), updated_at=clock_timestamp() WHERE id=$2`,[outcome,sessionId]);
   await client.query(`INSERT INTO evidence_records(user_id,capability_node_id,verification_tier,summary,context,artifact_code,test_trace) VALUES($1,$2,'CLIENT_EVALUATED',$3,$4,$5,$6::jsonb)`,[s.userId,r.capability_node_id,`${r.capability}: adaptive assessment ${outcome} after ${total} questions.`,`Target role: ${r.target_role}; experience level: ${r.seniority}; adaptive difficulty bounded by the server configuration.`,null,JSON.stringify([{total,correct,finalTheta:r.final_theta}])]);
   return {completed:true,isCorrect,outcome,total,correct,finalTheta:r.final_theta};
  });
  return NextResponse.json(result);
 }catch(error){
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  const status=message==='UNAUTHORIZED'?401:message==='NO_ACTIVE_QUESTION_RESERVATION'||message==='QUESTION_RESERVATION_MISMATCH'?409:message==='ASSESSMENT_NOT_FOUND'?404:500;
  return NextResponse.json({error:status===401?'Unauthorized':status===404?'Assessment session not found':status===409?'This question is no longer active. Refresh the assessment.':'Unable to submit answer'},{status});
 }
}
