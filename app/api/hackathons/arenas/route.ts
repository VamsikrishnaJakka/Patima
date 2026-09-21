import {NextResponse}from'next/server';
import {requireCandidate,withAuthenticatedClient}from'@/lib/server-auth';
import {handleRouteError}from'@/lib/api-errors';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 try{
  await requireCandidate();
  const {searchParams}=new URL(request.url);
  const domain=searchParams.get('domain');
  const level=searchParams.get('experience_level');
  const arenaType=searchParams.get('arena_type');
  const openOnly=searchParams.get('open_only')==='true';
  return await withAuthenticatedClient(async(s,client)=>{
   const capabilities=await client.query(`SELECT cn.slug,ucs.state,(SELECT final_theta FROM assessment_sessions WHERE user_id=$1 AND domain=cn.slug AND status='VERIFIED' ORDER BY submitted_at DESC LIMIT 1) AS verified_theta FROM capability_nodes cn LEFT JOIN user_capability_states ucs ON ucs.capability_node_id=cn.id AND ucs.user_id=$1`,[s.userId]);
   const candidateThetas=new Map<string,number|null>();
   for(const row of capabilities.rows)candidateThetas.set(row.slug,row.verified_theta==null?null:Number(row.verified_theta));
   let q=`SELECT a.id,a.title,a.domain,a.experience_level,a.scheduled_start,a.duration_minutes,a.arena_type,a.max_participants,a.creator_stack,a.status,a.created_at,u.name AS creator_name,u.handle AS creator_handle,COUNT(p.user_id)::int AS current_participants FROM hackathon_arenas a JOIN user_accounts u ON u.id=a.created_by LEFT JOIN hackathon_participants p ON p.arena_id=a.id WHERE a.is_public=TRUE AND a.status IN ('PROPOSED','AGREED','SCHEDULED') AND (a.scheduled_start IS NULL OR a.scheduled_start>=clock_timestamp()-INTERVAL '15 minutes')`;
   const params:any[]=[];
   const add=(value:string)=>{params.push(value);return '$'+params.length};
   if(domain&&domain!=='ALL')q=q.slice(0,-1)+` AND a.domain=${add(domain)};`;
   if(level&&level!=='ALL')q=q.slice(0,-1)+` AND a.experience_level=${add(level)};`;
   if(arenaType&&arenaType!=='ALL')q=q.slice(0,-1)+` AND a.arena_type=${add(arenaType)};`;
   q=q.slice(0,-1)+` GROUP BY a.id,u.name,u.handle ORDER BY a.scheduled_start NULLS LAST,a.created_at DESC LIMIT 50;`;
   const result=await client.query(q,params);
   const arenas=result.rows.filter((row:any)=>!openOnly||row.current_participants<row.max_participants).map((row:any)=>{
    const candidateTheta=candidateThetas.get(row.domain)??null;
    const targetTheta=row.experience_level==='BEGINNER'?2.5:row.experience_level==='INTERMEDIATE'?5.5:8.5;
    const disparity=candidateTheta==null?null:Math.abs(candidateTheta-targetTheta);
    const status=disparity==null?'UNESTABLISHED':disparity>=3?'SIGNIFICANT_DISPARITY':disparity>=1.5?'MODERATE_DISPARITY':'COMPATIBLE';
    const note=disparity==null?'No verified capability level is recorded for this domain yet.':status==='COMPATIBLE'?'Verified capability aligned with target arena difficulty.':status==='MODERATE_DISPARITY'?`Moderate capability difference (${disparity.toFixed(1)} θ).`:`Significant capability gap (${disparity.toFixed(1)} θ). Target level is ${row.experience_level}.`;
    return {id:row.id,title:row.title,domain:row.domain,experienceLevel:row.experience_level,scheduledStart:row.scheduled_start,durationMinutes:row.duration_minutes,arenaType:row.arena_type,maxParticipants:row.max_participants,currentParticipants:row.current_participants,creatorStack:row.creator_stack,creator:{name:row.creator_name,handle:row.creator_handle},parity:{candidateTheta,targetTheta,disparity,status,note},canJoin:row.current_participants<row.max_participants};
   });
   return NextResponse.json({arenas},{headers:{'Cache-Control':'no-store'}});
  });
 }catch(error){return handleRouteError(error,'hackathons/arenas');}
}
