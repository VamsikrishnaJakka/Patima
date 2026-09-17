import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const sessionId=typeof body.sessionId==='string'?body.sessionId:'';
  const probe=Number(body.probe);
  const answer=typeof body.answer==='string'?body.answer.slice(0,12000):'';
  if(!sessionId||!Number.isInteger(probe)||probe<1||probe>3||!answer.trim())return NextResponse.json({error:'A valid session, probe, and response are required'},{status:400});
  const result=await withAuthenticatedClient(async(s,client)=>{
   const r=await client.query(`SELECT id,current_probe,status,expires_at,answers FROM assessment_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE`,[sessionId,s.userId]);
   const row=r.rows[0];
   if(!row)throw new Error('ASSESSMENT_NOT_FOUND');
   if(row.status!=='IN_PROGRESS')throw new Error('ASSESSMENT_CLOSED');
   if(row.expires_at&&new Date(row.expires_at).getTime()<=Date.now()){
    await client.query(`UPDATE assessment_sessions SET status='EXPIRED',updated_at=clock_timestamp() WHERE id=$1`,[sessionId]);
    throw new Error('ASSESSMENT_EXPIRED');
   }
   if(probe>Number(row.current_probe))throw new Error('PROBE_ORDER_INVALID');
   const previous=Array.isArray(row.answers)?row.answers:[];
   const answers=previous.filter((item:any)=>Number(item.probe)!==probe);
   answers.push({probe,answer});
   answers.sort((a:any,b:any)=>Number(a.probe)-Number(b.probe));
   const nextProbe=Math.max(Number(row.current_probe),Math.min(3,probe+1));
   await client.query(`UPDATE assessment_sessions SET answers=$2::jsonb,current_probe=$3,last_activity_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,[sessionId,JSON.stringify(answers),nextProbe]);
   return {currentProbe:nextProbe,answeredProbes:answers.map((a:any)=>Number(a.probe))};
  });
  return NextResponse.json(result);
 }catch(error){
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  const status=message==='UNAUTHORIZED'?401:message==='ASSESSMENT_NOT_FOUND'||message==='ASSESSMENT_CLOSED'||message==='ASSESSMENT_EXPIRED'?404:message==='PROBE_ORDER_INVALID'?409:400;
  return NextResponse.json({error:status===401?'Unauthorized':status===409?'Complete the preceding probe before continuing':'Assessment progress could not be saved'},{status});
 }
}
