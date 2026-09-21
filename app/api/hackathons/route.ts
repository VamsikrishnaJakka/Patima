import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  const s=await requireCandidate();
  const data=await withAuthenticatedClient(async(_,client)=>{
   const r=await client.query('SELECT a.id,a.title,a.domain,a.experience_level,a.mode,a.scheduled_start,a.duration_minutes,a.arena_spec,a.status,a.created_by,json_agg(json_build_object(\'userId\',p.user_id,\'handle\',u.handle,\'name\',u.name,\'language\',p.declared_language,\'verifiedLevel\',p.verified_capability_level,\'agreed\',p.agreed_terms,\'agreedAt\',p.agreed_at) ORDER BY u.handle) participants FROM hackathon_arenas a JOIN hackathon_participants p ON p.arena_id=a.id JOIN user_accounts u ON u.id=p.user_id WHERE a.created_by=$1 OR EXISTS(SELECT 1 FROM hackathon_participants me WHERE me.arena_id=a.id AND me.user_id=$1) GROUP BY a.id ORDER BY a.scheduled_start NULLS LAST,a.created_at DESC',[s.userId]);
   return {hackathons:r.rows};
  });
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Unauthorized':'Unable to load hackathons'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});}
}

export async function POST(request:Request){
 try{
  const s=await requireCandidate();
  const body=await request.json();
  const {title,domain,experienceLevel='INTERMEDIATE',mode='1V1',opponentHandle,declaredLanguage='python',opponentLanguage='python',scheduledStart=null,durationMinutes=60,arenaSpec={}}=body||{};
  if(typeof title!=='string'||!title.trim()||typeof domain!=='string'||!domain.trim()||typeof opponentHandle!=='string'||!opponentHandle.trim())return NextResponse.json({error:'TITLE_DOMAIN_AND_OPPONENT_REQUIRED'},{status:400});
  const data=await withAuthenticatedClient(async(_,client)=>{
   const opponent=await client.query('SELECT id,handle FROM user_accounts WHERE lower(handle)=lower($1) AND role=\'candidate\' LIMIT 1',[opponentHandle.trim()]);
   if(!opponent.rows.length)return NextResponse.json({error:'OPPONENT_NOT_FOUND'},{status:404});
   if(opponent.rows[0].id===s.userId)return NextResponse.json({error:'CANNOT_CHALLENGE_SELF'},{status:400});
   const levels=await client.query('SELECT u.id,u.handle,MAX(asess.final_theta) AS theta FROM user_accounts u LEFT JOIN assessment_sessions asess ON asess.user_id=u.id AND asess.domain=$1 AND asess.status=\'VERIFIED\' WHERE u.id=ANY($2::uuid[]) GROUP BY u.id,u.handle',[domain,[s.userId,opponent.rows[0].id]]);
   const thetaByUser=new Map(levels.rows.map((r:any)=>[r.id,r.theta==null?null:Number(r.theta)]));
   const myTheta=thetaByUser.get(s.userId)??null,oppTheta=thetaByUser.get(opponent.rows[0].id)??null;
   const disparity=myTheta!=null&&oppTheta!=null?Math.abs(myTheta-oppTheta):null;
   const caution=disparity!=null&&disparity>=2?'Capability disparity detected: verified theta differs by '+disparity.toFixed(2)+'. Review the warning before accepting.':myTheta==null||oppTheta==null?'One or both participants lack a recent verified level; parity cannot be established yet.':'No material theta disparity detected.';
   const a=await client.query('INSERT INTO hackathon_arenas(title,domain,experience_level,mode,scheduled_start,duration_minutes,arena_spec,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,\'PROPOSED\',$8) RETURNING id',[title.trim(),domain,experienceLevel,mode,scheduledStart,durationMinutes,JSON.stringify({...arenaSpec,parity:{myTheta,oppTheta,disparity,caution},languages:{creator:declaredLanguage,opponent:opponentLanguage}}),s.userId]);
   await client.query('INSERT INTO hackathon_participants(arena_id,user_id,declared_language,verified_capability_level,agreed_terms) VALUES($1,$2,$3,$4,true),($1,$5,$6,$7,false)',[a.rows[0].id,s.userId,declaredLanguage,myTheta,opponent.rows[0].id,opponentLanguage,oppTheta]);
   return {id:a.rows[0].id,status:'PROPOSED',parity:{myTheta,oppTheta,disparity,caution}};
  });
  if(data instanceof NextResponse)return data;
  return NextResponse.json(data,{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create hackathon'},{status:400});}
}
