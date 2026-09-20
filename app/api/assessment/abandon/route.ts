import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export async function POST(request:Request){
  try{
    const session=await requireCandidate();
    const body=await request.json();
    const sessionId=String(body.sessionId||'');
    if(!sessionId)return NextResponse.json({error:'Session id is required'},{status:400});
    await withAuthenticatedClient(async(s,client)=>{
      const current=await client.query('SELECT id,status FROM assessment_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',[sessionId,s.userId]);
      if(!current.rows.length)return;
      if(current.rows[0].status!=='IN_PROGRESS')return;
      await client.query('DELETE FROM active_question_reservations WHERE session_id=$1',[sessionId]);
      await client.query("UPDATE assessment_sessions SET status='EXPIRED',updated_at=clock_timestamp(),last_activity_at=clock_timestamp() WHERE id=$1 AND user_id=$2 AND status='IN_PROGRESS'",[sessionId,s.userId]);
    });
    return NextResponse.json({ok:true});
  }catch(error){
    const message=error instanceof Error?error.message:'INTERNAL_ERROR';
    return NextResponse.json({error:message==='UNAUTHORIZED'?'Unauthorized':'Unable to exit assessment'},{status:message==='UNAUTHORIZED'?401:500});
  }
}
