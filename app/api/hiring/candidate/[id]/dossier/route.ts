import {NextResponse} from 'next/server';
import {requireEmployer,withAuthenticatedClient} from '@/lib/server-auth';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEVELS=['LEVEL_1_SUMMARY','LEVEL_2_CONTEXT','LEVEL_3_CODE','LEVEL_4_INTEGRITY'] as const;

type Level=typeof LEVELS[number];

export async function GET(request:Request,{params}:{params:{id:string}}){
 try{
  const s=await requireEmployer();
  if(!UUID.test(params.id))return NextResponse.json({error:'Invalid candidate id'},{status:400});
  const url=new URL(request.url),level=url.searchParams.get('disclosure_level') as Level||'LEVEL_1_SUMMARY',slug=url.searchParams.get('capability_slug');
  if(!LEVELS.includes(level))return NextResponse.json({error:'Invalid disclosure level'},{status:400});
  if(slug&&!/^[a-z0-9._-]+$/.test(slug))return NextResponse.json({error:'Invalid capability slug'},{status:400});
  return await withAuthenticatedClient(async(_,client)=>{
   const access=await client.query(`SELECT cvs.visibility,EXISTS(SELECT 1 FROM candidate_employer_authorizations cea WHERE cea.candidate_user_id=cvs.user_id AND cea.employer_account_id=$1 AND cea.revoked_at IS NULL) authorized FROM candidate_visibility_settings cvs JOIN user_accounts u ON u.id=cvs.user_id AND u.role='candidate' WHERE cvs.user_id=$2`,[s.employerAccountId,params.id]);
   if(!access.rows.length)return NextResponse.json({error:'Candidate not found'},{status:404});
   const v=access.rows[0];
   if(v.visibility==='PRIVATE'||(v.visibility==='APPROVED_EMPLOYERS_ONLY'&&!v.authorized))return NextResponse.json({error:'Candidate profile is private or unauthorized'},{status:404});
   const e=await client.query(`SELECT er.id evidence_id,cn.id capability_node_id,cn.slug,cn.name,ucs.state,er.verification_tier,er.summary,er.context,er.artifact_code,er.test_trace,er.peer_review_summary,er.artifact_sha256,er.merkle_root,er.attestation_signature,er.recorded_at FROM evidence_records er JOIN capability_nodes cn ON cn.id=er.capability_node_id JOIN user_capability_states ucs ON ucs.user_id=er.user_id AND ucs.capability_node_id=er.capability_node_id WHERE er.user_id=$1 AND ($2::text IS NULL OR cn.slug=$2) ORDER BY er.recorded_at DESC LIMIT 1`,[params.id,slug]);
   if(!e.rows.length)return NextResponse.json({error:'No evidence found for selected node'},{status:404});
   const raw=e.rows[0];
   const evidence:any={evidence_id:raw.evidence_id,capability_node_id:raw.capability_node_id,slug:raw.slug,name:raw.name,state:raw.state,verification_tier:raw.verification_tier,summary:raw.summary,recorded_at:raw.recorded_at};
   if(level==='LEVEL_2_CONTEXT'||level==='LEVEL_3_CODE'||level==='LEVEL_4_INTEGRITY')evidence.context=raw.context;
   if(level==='LEVEL_3_CODE'||level==='LEVEL_4_INTEGRITY'){evidence.artifact_code=raw.artifact_code;evidence.test_trace=raw.test_trace;evidence.peer_review_summary=raw.peer_review_summary;}
   if(level==='LEVEL_4_INTEGRITY'){evidence.artifact_sha256=raw.artifact_sha256;evidence.merkle_root=raw.merkle_root;evidence.attestation_signature=raw.attestation_signature;}
   await client.query(`INSERT INTO evidence_access_events(employer_account_id,actor_user_id,candidate_user_id,capability_node_id,disclosure_level) VALUES($1,$2,$3,$4,$5)`,[s.employerAccountId,s.userId,params.id,raw.capability_node_id,level]);
   return NextResponse.json({candidate_id:params.id,disclosure_level:level,evidence});
  });
 }catch(e){return NextResponse.json({error:e instanceof Error&&e.message==='UNAUTHORIZED'?'Unauthorized employer session':'Internal server error inspecting evidence'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:500});}
}
