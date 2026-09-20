import {NextResponse} from 'next/server';
import {getAssessment} from '@/lib/assessment-catalog';
import {allocateNextQuestion} from '@/lib/assessment/allocator';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 try{
  const session=await requireCandidate();
  const id=new URL(request.url).searchParams.get('id');
  if(!id)return NextResponse.json({error:'Session id is required'},{status:400});
  const result=await withAuthenticatedClient(async(s,client)=>{
   const row=await client.query(`SELECT id,domain_slug,experience_level,status,current_step,started_at,expires_at
     FROM assessment_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE`,[id,s.userId]);
   if(!row.rows[0])throw new Error('ASSESSMENT_NOT_FOUND');
   const item=row.rows[0];
   const assessment=getAssessment(item.domain_slug);
   if(!assessment)throw new Error('ASSESSMENT_UNAVAILABLE');
   if(item.status!=='IN_PROGRESS')return {closed:true,status:item.status};
   const question=await allocateNextQuestion(client,{sessionId:id,userId:s.userId});
   if(!question)return {closed:true,status:'SUBMITTED'};
   return {closed:false,session:item,assessment:{slug:assessment.slug,title:assessment.title,description:assessment.description},question};
  });
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  const postgresCode=error&&typeof error==='object'&&'code' in error?String((error as {code?:unknown}).code):'';
  console.error('[PATIMA] assessment resume failed', {message, postgresCode});
  const status=message==='UNAUTHORIZED'?401:
   message==='ASSESSMENT_NOT_FOUND'?404:
   message==='ASSESSMENT_UNAVAILABLE'?503:
   message==='INSUFFICIENT_QUESTION_INVENTORY_FOR_SPECIFICATION'?409:
   postgresCode==='42703'||postgresCode==='42P01'?503:500;
  return NextResponse.json({
   error:status===401?'Unauthorized':
    status===404?'Assessment session not found':
    status===409?'There are not enough unused questions to continue this assessment.':
    status===503?'Assessment database configuration is incomplete or outdated. Run the latest migrations.':
    'Unable to load adaptive assessment'
  },{status});
 }
}
