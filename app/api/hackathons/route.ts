import {NextResponse}from'next/server';
import {requireCandidate,withAuthenticatedClient}from'@/lib/server-auth';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  const s=await requireCandidate();
  return await withAuthenticatedClient(async(_,client)=>{
   const r=await client.query(`
    SELECT a.id,a.title,a.domain,a.experience_level,a.mode,a.arena_type,a.max_participants,
           a.creator_stack,a.is_public,a.scheduled_start,a.duration_minutes,a.arena_spec,a.status,a.created_by,
           json_agg(json_build_object('userId',p.user_id,'handle',u.handle,'name',u.name,'language',p.declared_language,'verifiedLevel',p.verified_capability_level,'agreed',p.agreed_terms,'agreedAt',p.agreed_at) ORDER BY u.handle) participants
    FROM hackathon_arenas a
    JOIN hackathon_participants p ON p.arena_id=a.id
    JOIN user_accounts u ON u.id=p.user_id
    WHERE a.created_by=$1 OR EXISTS(SELECT 1 FROM hackathon_participants me WHERE me.arena_id=a.id AND me.user_id=$1)
    GROUP BY a.id
    ORDER BY a.scheduled_start NULLS LAST,a.created_at DESC
   `,[s.userId]);
   return NextResponse.json({hackathons:r.rows},{headers:{'Cache-Control':'no-store'}});
  });
 }catch(e){return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Unauthorized':'Unable to load hackathons'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});}
}

export async function POST(request:Request){
 try{
  const s=await requireCandidate();
  const body=await request.json();
  const {title,domain,experienceLevel='INTERMEDIATE',arenaType='OPEN',declaredLanguage='python',scheduledStart=null,durationMinutes=60,problemSuggestion=''}=body||{};
  if(typeof title!=='string'||!title.trim()||typeof domain!=='string'||!domain.trim())return NextResponse.json({error:'TITLE_AND_DOMAIN_REQUIRED'},{status:400});
  if(!['OPEN','PRIVATE_1V1','TEAM'].includes(arenaType))return NextResponse.json({error:'INVALID_ARENA_TYPE'},{status:400});
  const maxParticipants=arenaType==='TEAM'?4:2;
  return await withAuthenticatedClient(async(_,client)=>{
   const theta=await client.query(`SELECT final_theta FROM assessment_sessions WHERE user_id=$1 AND domain=$2 AND status='VERIFIED' ORDER BY submitted_at DESC LIMIT 1`,[s.userId,domain]);
   const myTheta=theta.rows[0]?.final_theta==null?null:Number(theta.rows[0].final_theta);
   const targetTheta=experienceLevel==='BEGINNER'?2.5:experienceLevel==='INTERMEDIATE'?5.5:8.5;
   const a=await client.query(`
    INSERT INTO hackathon_arenas(title,domain,experience_level,mode,arena_type,max_participants,creator_stack,is_public,scheduled_start,duration_minutes,arena_spec,status,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'PROPOSED',$12)
    RETURNING id
   `,[title.trim(),domain,experienceLevel,arenaType==='TEAM'?'TEAM':'1V1',arenaType,maxParticipants,String(declaredLanguage||'unspecified'),arenaType==='OPEN',scheduledStart,durationMinutes,JSON.stringify({problemSuggestion:String(problemSuggestion||'').trim()||null,platformRules:{fixtures:'PATIMA_AUTHORED',publicTests:'PATIMA_AUTHORED',hiddenTests:'PATIMA_AUTHORED',runtimeLimits:{cpuLimitMs:2000,memoryLimitMb:128,network:false},candidateSuggestion:'ADVISORY_ONLY'},creatorTheta:myTheta,targetTheta}),s.userId]);
   await client.query(`INSERT INTO hackathon_participants(arena_id,user_id,declared_language,verified_capability_level,agreed_terms,agreed_at) VALUES($1,$2,$3,$4,true,clock_timestamp())`,[a.rows[0].id,s.userId,String(declaredLanguage||'unspecified'),myTheta]);
   return NextResponse.json({id:a.rows[0].id,status:'PROPOSED',arenaType},{status:201});
  });
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create arena'},{status:400});}
}
