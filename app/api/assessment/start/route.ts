import {NextResponse}from'next/server';
import {getAssessment,getAssessmentDisplayTitle}from'@/lib/assessment-catalog';
import {allocateNextQuestion}from'@/lib/assessment/allocator';
import {requireCandidate,withAuthenticatedClient}from'@/lib/server-auth';

const levels=['BEGINNER','INTERMEDIATE','ADVANCED'] as const;
type ExperienceLevel=typeof levels[number];

const questionChoices=[5,10,15,20];
const durationFor=(level:ExperienceLevel,count:number)=>Math.ceil((count*(level==='BEGINNER'?90:level==='INTERMEDIATE'?100:120))/60);

export async function POST(request:Request){
 let userId:string|undefined;
 let domain='';
 let assessmentTitle='';
 try{
  const session=await requireCandidate();
  userId=session.userId;
  const body=await request.json();
  domain=typeof body.domain==='string'?body.domain:'';
  const experienceLevel=String(body.experienceLevel||'').toUpperCase() as ExperienceLevel;
  const questionCount=Number(body.questionCount)||0;
  const targetRole=typeof body.targetRole==='string'&&body.targetRole.trim()?body.targetRole.trim():null;
  const seniority=typeof body.seniority==='string'&&['JUNIOR','MID','SENIOR'].includes(body.seniority.toUpperCase())?body.seniority.toUpperCase():null;
  if(!levels.includes(experienceLevel))return NextResponse.json({error:'Invalid experience level'},{status:400});
  if(!questionChoices.includes(questionCount))return NextResponse.json({error:'Choose 5, 10, 15, or 20 questions'},{status:400});
  const assessment=getAssessment(domain);
  if(!assessment)return NextResponse.json({error:'Assessment domain is unavailable'},{status:400});
  assessmentTitle=assessment.title;

  const result=await withAuthenticatedClient(async(_,client)=>{
   const config=await client.query(
    `SELECT total_questions,duration_minutes,min_difficulty,max_difficulty,starting_difficulty
     FROM assessment_level_configs
     WHERE domain=$1 AND experience_level=$2 LIMIT 1`,
    [domain,experienceLevel]
   );
   if(!config.rows[0])throw new Error('ASSESSMENT_LEVEL_NOT_CONFIGURED');

   const node=await client.query(`SELECT id FROM capability_nodes WHERE slug=$1 LIMIT 1`,[assessment.capabilitySlug]);
   if(!node.rows[0])throw new Error('CAPABILITY_NOT_CONFIGURED');

   const inserted=await client.query(
    `INSERT INTO assessment_sessions
      (user_id,target_role,seniority,domain_slug,capability_node_id,domain,experience_level,current_step,status,started_at,expires_at,last_activity_at,selected_question_count,selected_duration_minutes,target_role_source,seniority_source)
     VALUES($1,$2,$3,$4,$5,$6,$7,1,'IN_PROGRESS',clock_timestamp(),clock_timestamp()+($9 * interval '1 minute'),clock_timestamp(),$8,$9,$10,$11)
     RETURNING id`,
    [session.userId,targetRole,seniority,assessment.slug,node.rows[0].id,domain,experienceLevel,questionCount,durationFor(experienceLevel,questionCount),targetRole?'USER_PROVIDED':'SYSTEM_INFERRED',seniority?'USER_PROVIDED':'SYSTEM_INFERRED]
   );
   const question=await allocateNextQuestion(client,{sessionId:inserted.rows[0].id,userId:session.userId});
   if(!question)throw new Error('QUESTION_ALLOCATION_FAILED');
   return {
    sessionId:inserted.rows[0].id,
    assessment:{slug:assessment.slug,title:getAssessmentDisplayTitle(domain,experienceLevel),capabilityName:assessment.capabilityName},
    config:{...config.rows[0],total_questions:questionCount,duration_minutes:durationFor(experienceLevel,questionCount)},
    question
   };
  });
  return NextResponse.json(result);
 }catch(error){
  const postgresCode=error&&typeof error==='object'&&'code' in error?String((error as {code?:unknown}).code):'';
  if(postgresCode==='23505'&&userId){
   try{
    const active=await withAuthenticatedClient(async(_,client)=>client.query(
     `SELECT id,experience_level,current_step,selected_question_count,expires_at
      FROM assessment_sessions
      WHERE user_id=$1 AND domain=$2 AND status='IN_PROGRESS'
      ORDER BY started_at DESC LIMIT 1`,
     [userId,domain]
    ));
    const row=active.rows[0];
    return NextResponse.json({
     error:'SESSION_ALREADY_ACTIVE',
     message:row
      ? `You already have an active ${String(row.experience_level||'').toLowerCase()} ${assessmentTitle} assessment. Resume it or exit it before starting another.`
      : 'You already have an active assessment for this technology. Resume it or exit it before starting another.',
     sessionId:row?.id||null,
     experienceLevel:row?.experience_level||null,
     currentStep:row?.current_step||null,
     questionCount:row?.selected_question_count||null,
     expiresAt:row?.expires_at||null
    },{status:409});
   }catch{
    return NextResponse.json({error:'SESSION_ALREADY_ACTIVE',message:'You already have an active assessment for this technology. Resume it or exit it before starting another.'},{status:409});
   }
  }
  const message=error instanceof Error?error.message:'INTERNAL_ERROR';
  console.error('[PATIMA] assessment start failed', {domain, userId, message, postgresCode});
  const status=message==='UNAUTHORIZED'?401:
   message==='ASSESSMENT_LEVEL_NOT_CONFIGURED'?409:
   message==='CAPABILITY_NOT_CONFIGURED'?503:
   message==='INSUFFICIENT_QUESTION_INVENTORY_FOR_SPECIFICATION'?409:
   message==='SESSION_NOT_FOUND_OR_UNAUTHORIZED'?404:
   postgresCode==='42703'||postgresCode==='42P01'?503:500;
  return NextResponse.json({error:
   status===401?'Unauthorized':
   status===409&&message==='ASSESSMENT_LEVEL_NOT_CONFIGURED'?'This experience level is not available for this technology yet.':
   status===409&&message==='INSUFFICIENT_QUESTION_INVENTORY_FOR_SPECIFICATION'?'There are not enough unused questions for this assessment specification.':
   status===404?'Assessment session was not found':
   status===503?'Assessment database configuration is incomplete or outdated. Run the latest migrations.':
   'Unable to start assessment'
  },{status});
 }
}
