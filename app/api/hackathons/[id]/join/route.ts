import {NextResponse}from'next/server';
import {requireCandidate,withAuthenticatedClient}from'@/lib/server-auth';

export async function POST(request:Request,{params}:{params:{id:string}}){
 try{
  const s=await requireCandidate();
  const body=await request.json().catch(()=>({}));
  const declaredLanguage=typeof body?.declaredLanguage==='string'&&body.declaredLanguage.trim()?body.declaredLanguage.trim():'unspecified';
  return await withAuthenticatedClient(async(_,client)=>{
   const arena=await client.query(`
    SELECT a.id,a.is_public,a.status,a.max_participants,COUNT(p.user_id)::int AS current_participants
    FROM hackathon_arenas a LEFT JOIN hackathon_participants p ON p.arena_id=a.id
    WHERE a.id=$1 GROUP BY a.id
    FOR UPDATE OF a
   `,[params.id]);
   if(!arena.rows.length)throw new Error('HACKATHON_NOT_FOUND');
   const a=arena.rows[0];
   if(!a.is_public)throw new Error('ARENA_NOT_PUBLIC');
   if(!['PROPOSED','AGREED','SCHEDULED'].includes(a.status))throw new Error('ARENA_NOT_JOINABLE');
   if(Number(a.current_participants)>=Number(a.max_participants))throw new Error('ARENA_FULL');
   const existing=await client.query('SELECT 1 FROM hackathon_participants WHERE arena_id=$1 AND user_id=$2',[params.id,s.userId]);
   if(existing.rows.length)return NextResponse.json({joined:true,status:a.status});
   await client.query('INSERT INTO hackathon_participants(arena_id,user_id,declared_language,verified_capability_level,agreed_terms) VALUES($1,$2,$3,(SELECT final_theta FROM assessment_sessions WHERE user_id=$2 AND domain=(SELECT domain FROM hackathon_arenas WHERE id=$1) AND status=\'VERIFIED\' ORDER BY submitted_at DESC LIMIT 1),false)',[params.id,s.userId,declaredLanguage]);
   return NextResponse.json({joined:true,status:'PROPOSED'},{status:201});
  });
 }catch(e){const message=e instanceof Error?e.message:'Unable to join arena';const status=message==='HACKATHON_NOT_FOUND'?404:400;return NextResponse.json({error:message},{status});}
}
