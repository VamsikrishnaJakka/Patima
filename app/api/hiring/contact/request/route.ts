import {NextResponse} from 'next/server';
import {requireEmployer,withAuthenticatedClient} from '@/lib/server-auth';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTACT_ROLES=['OWNER','HIRING_MANAGER','RECRUITER'];
export async function POST(request:Request){
 try{
  const s=await requireEmployer();const b=await request.json();const candidateId=String(b.candidate_id||'');const roleTitle=String(b.role_title||'').trim();const message=String(b.message_body||'').trim();
  if(!UUID.test(candidateId)||!roleTitle||!message||roleTitle.length>128||message.length>4000)return NextResponse.json({error:'Invalid contact request'},{status:400});
  return await withAuthenticatedClient(async(_,client)=>{
   const member=await client.query(`SELECT role FROM employer_members WHERE employer_account_id=$1 AND user_account_id=$2`,[s.employerAccountId,s.userId]);
   if(!CONTACT_ROLES.includes(member.rows[0]?.role))return NextResponse.json({error:'Insufficient permissions'},{status:403});
   const candidate=await client.query(`SELECT cvs.visibility,cvs.accepting_contact_requests,u.role FROM candidate_visibility_settings cvs JOIN user_accounts u ON u.id=cvs.user_id WHERE cvs.user_id=$1`,[candidateId]);
   if(!candidate.rows.length||candidate.rows[0].role!=='candidate')return NextResponse.json({error:'Candidate not found'},{status:404});
   if(candidate.rows[0].visibility==='PRIVATE'||!candidate.rows[0].accepting_contact_requests)return NextResponse.json({error:'Candidate is not accepting contact requests'},{status:403});
   if(candidate.rows[0].visibility==='APPROVED_EMPLOYERS_ONLY'){
    const auth=await client.query(`SELECT 1 FROM candidate_employer_authorizations WHERE candidate_user_id=$1 AND employer_account_id=$2 AND revoked_at IS NULL`,[candidateId,s.employerAccountId]);
    if(!auth.rows.length)return NextResponse.json({error:'Candidate has not authorized this employer'},{status:403});
   }
   const q=await client.query(`SELECT COUNT(*)::int count FROM candidate_contact_intents WHERE employer_account_id=$1 AND created_at>=clock_timestamp()-INTERVAL '7 days'`,[s.employerAccountId]);
   if(q.rows[0].count>=5)return NextResponse.json({error:'Weekly candidate contact quota exceeded'},{status:429});
   const r=await client.query(`INSERT INTO candidate_contact_intents(employer_account_id,candidate_user_id,requested_by_user_id,role_title,message_body) VALUES($1,$2,$3,$4,$5) RETURNING id,status,expires_at`,[s.employerAccountId,candidateId,s.userId,roleTitle,message]);
   return NextResponse.json({...r.rows[0],contact_details_unlocked:false},{status:201});
  },{requiresAdvisoryLock:true});
 }catch(e:any){if(e?.code==='23505')return NextResponse.json({error:'A pending or active contact request already exists for this candidate and role'},{status:409});if(e?.message==='WEEKLY_CONTACT_QUOTA_EXCEEDED')return NextResponse.json({error:'Weekly candidate contact quota exceeded'},{status:429});return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Unauthorized employer session':'Internal database error dispatching contact intent'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});}
}
