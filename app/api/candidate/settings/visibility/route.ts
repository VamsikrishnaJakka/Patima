import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

type CandidateVisibilitySession={userId:string};
type DbClient={query:(text:string,values?:unknown[])=>Promise<{rows:any[]}>};

export async function GET(){
 try{
  await requireCandidate();
  const data=await withAuthenticatedClient(async(session:CandidateVisibilitySession,client:DbClient)=>{const r=await client.query(`SELECT visibility,accepting_contact_requests,peer_visibility FROM candidate_visibility_settings WHERE user_id=$1`,[session.userId]);return r.rows[0]||{visibility:'PRIVATE',accepting_contact_requests:true,peer_visibility:false};});
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{ return NextResponse.json({error:'Unauthorized'},{status:401}); }
}

export async function POST(req:Request){
 try{
  await requireCandidate();
  const body=await req.json();
  const visibility=body.visibility;
  if(!['PRIVATE','APPROVED_EMPLOYERS_ONLY','PUBLIC'].includes(visibility))return NextResponse.json({error:'Invalid visibility'},{status:400});
  const accepting=Boolean(body.accepting_contact_requests);
  const peers=Boolean(body.peer_visibility);
  const data=await withAuthenticatedClient(async(session:CandidateVisibilitySession,client:DbClient)=>{const r=await client.query(`INSERT INTO candidate_visibility_settings(user_id,visibility,accepting_contact_requests,peer_visibility,updated_at) VALUES($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(user_id) DO UPDATE SET visibility=EXCLUDED.visibility,accepting_contact_requests=EXCLUDED.accepting_contact_requests,peer_visibility=EXCLUDED.peer_visibility,updated_at=clock_timestamp() RETURNING visibility,accepting_contact_requests,peer_visibility`,[session.userId,visibility,accepting,peers]);return r.rows[0];});
  return NextResponse.json(data);
 }catch(error){const message=error instanceof Error?error.message:'';return NextResponse.json({error:message==='UNAUTHORIZED'?'Unauthorized':'Unable to update privacy settings'},{status:message==='UNAUTHORIZED'?401:500});}
}
