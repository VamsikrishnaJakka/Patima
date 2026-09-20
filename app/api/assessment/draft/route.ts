import {NextResponse} from 'next/server';
import {requireCandidate} from '@/lib/server-auth';
import {withSessionClient} from '@/lib/db';

export async function POST(request:Request){
 try{
  const candidate=await requireCandidate();
  const body=await request.json();
  const sessionId=String(body.sessionId||'');
  const variantId=String(body.variantId||'');
  const code=String(body.code||'').slice(0,20000);
  if(!sessionId||!variantId)return NextResponse.json({error:'MISSING_REQUIRED_FIELDS'},{status:400});
  await withSessionClient(candidate.userId,async(client)=>{
   const r=await client.query(`
    UPDATE assessment_adaptive_logs l
    SET draft_response=$1
    FROM assessment_sessions s
    JOIN active_question_reservations ar ON ar.session_id=s.id
    WHERE l.session_id=s.id
      AND l.step_index=s.current_step
      AND ar.variant_id=$2
      AND s.id=$3
      AND s.user_id=$4
      AND s.status='IN_PROGRESS'
      AND ar.expires_at>clock_timestamp()
   `,[code,variantId,sessionId,candidate.userId]);
   if(!r.rowCount)throw new Error('DRAFT_NOT_SAVED');
  });
  return NextResponse.json({ok:true});
 }catch(error){
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  return NextResponse.json({error:message==='UNAUTHORIZED'?'Unauthorized':'Unable to save draft'},{status:message==='UNAUTHORIZED'?401:500});
 }
}
