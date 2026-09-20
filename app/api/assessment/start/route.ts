import {NextResponse} from 'next/server';
import {getAssessment} from '@/lib/assessment-catalog';
import {allocateNextQuestion} from '@/lib/assessment/allocator';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

const levels=['BEGINNER','INTERMEDIATE','ADVANCED'] as const;
type ExperienceLevel=typeof levels[number];

const roleForDomain=(domain:string)=>domain==='sql-window-functions'?'Data Engineer':domain==='python-concurrency'||domain==='java.concurrency_memory'?'Backend Engineer':'Platform / DevOps Engineer';
const seniorityForLevel=(level:ExperienceLevel)=>level==='BEGINNER'?'JUNIOR':level==='INTERMEDIATE'?'MID':'SENIOR';
const questionChoices=[5,10,15,20];
const durationFor=(level:ExperienceLevel,count:number)=>Math.ceil((count*(level==='BEGINNER'?90:level==='INTERMEDIATE'?100:120))/60);

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const domain=typeof body.domain==='string'?body.domain:'';
  const experienceLevel=String(body.experienceLevel||'').toUpperCase() as ExperienceLevel;
  const questionCount=Number(body.questionCount)||0;
  if(!levels.includes(experienceLevel))return NextResponse.json({error:'Invalid experience level'},{status:400});
  if(!questionChoices.includes(questionCount))return NextResponse.json({error:'Choose 5, 10, 15, or 20 questions'},{status:400});
  const assessment=getAssessment(domain);
  if(!assessment)return NextResponse.json({error:'Assessment domain is unavailable'},{status:400});

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
      (user_id,target_role,seniority,domain_slug,capability_node_id,domain,experience_level,current_step,status,started_at,expires_at,last_activity_at,selected_question_count,selected_duration_minutes)
     VALUES($1,$2,$3,$4,$5,$6,$7,1,'IN_PROGRESS',clock_timestamp(),clock_timestamp()+($9 * interval '1 minute'),clock_timestamp(),$8,$9)
     RETURNING id`,
    [session.userId,roleForDomain(domain),seniorityForLevel(experienceLevel),assessment.slug,node.rows[0].id,domain,experienceLevel,questionCount,durationFor(experienceLevel,questionCount)]
   );
   const question=await allocateNextQuestion(client,{sessionId:inserted.rows[0].id,userId:session.userId});
   if(!question)throw new Error('QUESTION_ALLOCATION_FAILED');
   return {
    sessionId:inserted.rows[0].id,
    assessment:{slug:assessment.slug,title:assessment.title,capabilityName:assessment.capabilityName},
    config:{...config.rows[0],total_questions:questionCount,duration_minutes:durationFor(experienceLevel,questionCount)},
    question
   };
  });
  return NextResponse.json(result);
 }catch(error){
  const postgresCode=error&&typeof error==='object'&&'code' in error?String((error as {code?:unknown}).code):'';
  if(postgresCode==='23505'){
   try{
    const active=await withAuthenticatedClient(async(_,client)=>client.query(
     `SELECT id,experience_level,current_step,selected_question_count,expires_at
      FROM assessment_sessions
      WHERE user_id=$1 AND domain=$2 AND status='IN_PROGRESS'
      ORDER BY started_at DESC LIMIT 1`,
     [session.userId,domain]
    ));
    const row=active.rows[0];
    return NextResponse.json({
     error:'SESSION_ALREADY_ACTIVE',
     message:row
      ? `You already have an active ${String(row.experience_level||'').toLowerCase()} ${assessment.title} assessment. Resume it or exit it before starting another.`
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
  const status=message==='UNAUTHORIZED'?401:message==='ASSESSMENT_LEVEL_NOT_CONFIGURED'?409:message==='CAPABILITY_NOT_CONFIGURED'?503:500;
  return NextResponse.json({error:
   status===401?'Unauthorized':
   status===409?'This experience level is not available for this technology yet.':
   status===503?'Assessment capability is not configured':
   'Unable to start assessment'
  },{status});
 }
}
