import {NextResponse} from 'next/server';
import {requireCandidate} from '@/lib/server-auth';
import {withSessionClient} from '@/lib/db';
import {allocateNextQuestion} from '@/lib/assessment/allocator';
import {handleRouteError} from '@/lib/api-errors';

export async function POST(request:Request){
 try{
  const s=await requireCandidate();
  const b=await request.json();
  const sessionId=String(b.sessionId||'');
  const variantId=String(b.variantId||'');
  if(!sessionId||!variantId)return NextResponse.json({error:'MISSING_REQUIRED_FIELDS'},{status:400});
  return await withSessionClient(s.userId,async(c)=>{
   const r=await c.query(`SELECT question_type,response_mode
     FROM question_variants v
     JOIN active_question_reservations ar ON ar.variant_id=v.id AND ar.session_id=$2
     JOIN assessment_sessions a ON a.id=ar.session_id
     WHERE v.id=$1 AND a.user_id=$3 AND a.status='IN_PROGRESS' AND ar.expires_at>clock_timestamp()
     FOR UPDATE OF ar`,[variantId,sessionId,s.userId]);
   if(!r.rows.length)return NextResponse.json({error:'VARIANT_NOT_FOUND_OR_LEASE_EXPIRED'},{status:404});
   const next=await allocateNextQuestion(c,{sessionId,userId:s.userId,expectedVariantId:variantId,submittedCode:'[SKIPPED]',durationSeconds:0,verificationReport:{verdict:'SKIPPED',publicTestsPassed:0,publicTestsTotal:0,hiddenTestsPassed:0,hiddenTestsTotal:0,executionTimeMs:0,peakMemoryKb:null,executionDigest:cryptoDigest(sessionId+variantId),isCorrect:null}});
   return next?NextResponse.json({status:'IN_PROGRESS',nextQuestion:next}):NextResponse.json({status:'COMPLETED',redirectUrl:'/app/results?sessionId='+encodeURIComponent(sessionId)});
  });
 }catch(e){return handleRouteError(e,'assessments/skip-step')}
}
function cryptoDigest(value:string){let h=0;for(let i=0;i<value.length;i++)h=((h<<5)-h+value.charCodeAt(i))|0;return String(h)}
