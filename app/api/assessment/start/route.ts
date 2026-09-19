import {NextResponse} from 'next/server';
import {getAssessment} from '@/lib/assessment-catalog';
import {allocateNextQuestion} from '@/lib/assessment/allocator';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

const levels=['BEGINNER','INTERMEDIATE','ADVANCED'] as const;
type ExperienceLevel=typeof levels[number];

const roleForDomain=(domain:string)=>domain==='sql-window-functions'?'Data Engineer':domain==='python-concurrency'||domain==='java.concurrency_memory'?'Backend Engineer':'Platform / DevOps Engineer';
const seniorityForLevel=(level:ExperienceLevel)=>level==='BEGINNER'?'JUNIOR':level==='INTERMEDIATE'?'MID':'SENIOR';

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const domain=typeof body.domain==='string'?body.domain:'';
  const experienceLevel=String(body.experienceLevel||'').toUpperCase() as ExperienceLevel;
  if(!levels.includes(experienceLevel))return NextResponse.json({error:'Invalid experience level'},{status:400});
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
      (user_id,target_role,seniority,domain_slug,capability_node_id,domain,experience_level,current_step,status,started_at,expires_at,last_activity_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,1,'IN_PROGRESS',clock_timestamp(),clock_timestamp()+($8 * interval '1 minute'),clock_timestamp())
     RETURNING id`,
    [session.userId,roleForDomain(domain),seniorityForLevel(experienceLevel),assessment.slug,node.rows[0].id,domain,experienceLevel,config.rows[0].duration_minutes]
   );
   const question=await allocateNextQuestion(client,{sessionId:inserted.rows[0].id,userId:session.userId});
   if(!question)throw new Error('QUESTION_ALLOCATION_FAILED');
   return {
    sessionId:inserted.rows[0].id,
    assessment:{slug:assessment.slug,title:assessment.title,capabilityName:assessment.capabilityName},
    config:config.rows[0],
    question
   };
  });
  return NextResponse.json(result);
 }catch(error){
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
