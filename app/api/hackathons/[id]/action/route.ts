import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export async function POST(request:Request,{params}:{params:{id:string}}){
 try{
  const s=await requireCandidate();
  const body=await request.json();
  const action=body?.action;
  if(!['ACCEPT','SCHEDULE','CANCEL'].includes(action))return NextResponse.json({error:'INVALID_ACTION'},{status:400});
  const result=await withAuthenticatedClient(async(_,client)=>{
   const participant=await client.query('SELECT p.agreed_terms,a.created_by,a.status,a.scheduled_start,a.duration_minutes,a.experience_level,a.arena_spec FROM hackathon_participants p JOIN hackathon_arenas a ON a.id=p.arena_id WHERE p.arena_id=$1 AND p.user_id=$2 FOR UPDATE',[params.id,s.userId]);
   if(!participant.rows.length)throw new Error('HACKATHON_NOT_FOUND');
   const row=participant.rows[0];
   if(action==='ACCEPT'){
    await client.query('UPDATE hackathon_participants SET agreed_terms=true,agreed_at=clock_timestamp() WHERE arena_id=$1 AND user_id=$2',[params.id,s.userId]);
   }
   const parts=await client.query('SELECT agreed_terms FROM hackathon_participants WHERE arena_id=$1 ORDER BY user_id',[params.id]);
   const allAgreed=parts.rows.length>=2&&parts.rows.every((p:any)=>p.agreed_terms===true);
   if(action==='SCHEDULE'){
    if(!allAgreed)throw new Error('ALL_PARTICIPANTS_MUST_AGREE');
    const start=body?.scheduledStart||row.scheduled_start;
    if(!start)throw new Error('SCHEDULED_START_REQUIRED');
    await client.query('UPDATE hackathon_arenas SET scheduled_start=$1,status=\'SCHEDULED\' WHERE id=$2',[start,params.id]);
   }else if(action==='CANCEL'){
    await client.query('UPDATE hackathon_arenas SET status=\'CANCELLED\' WHERE id=$1',[params.id]);
   }else if(action==='ACCEPT'&&allAgreed){
    await client.query('UPDATE hackathon_arenas SET status=\'AGREED\' WHERE id=$1 AND status=\'PROPOSED\'',[params.id]);
   }
   const updated=await client.query('SELECT id,status,scheduled_start FROM hackathon_arenas WHERE id=$1',[params.id]);
   return {arena:updated.rows[0],allAgreed};
  });
  return NextResponse.json(result);
 }catch(e){const message=e instanceof Error?e.message:'Unable to update hackathon';const status=message==='HACKATHON_NOT_FOUND'?404:400;return NextResponse.json({error:message},{status});}
}
