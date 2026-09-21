import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request:Request){
 try{
  const session=await requireCandidate();
  const body=await request.json();
  const evidenceId=typeof body.evidence_id==='string'?body.evidence_id:'';
  if(!UUID.test(evidenceId))return NextResponse.json({error:'Invalid evidence id'},{status:400});
  return await withAuthenticatedClient(async(s,client)=>{
   const visibility=await client.query(
    `SELECT visibility FROM candidate_visibility_settings WHERE user_id=$1`,
    [s.userId]
   );
   if(visibility.rows[0]?.visibility!=='PUBLIC'){
    return NextResponse.json({error:'Set evidence visibility to Public before creating an inspection link.'},{status:409});
   }

   const result=await client.query(
    `INSERT INTO public_evidence_shares(
       token,evidence_id,candidate_user_id,capability_slug,capability_name,state,
       verification_tier,summary,context,artifact_code,test_trace,artifact_sha256,
       merkle_root,attestation_signature,recorded_at
     )
     SELECT encode(gen_random_bytes(24),'hex'),er.id,er.user_id,cn.slug,cn.name,
            COALESCE(ucs.state,'PROVISIONAL'),er.verification_tier,er.summary,er.context,
            er.artifact_code,er.test_trace,er.artifact_sha256,er.merkle_root,
            er.attestation_signature,er.recorded_at
     FROM evidence_records er
     JOIN capability_nodes cn ON cn.id=er.capability_node_id
     LEFT JOIN user_capability_states ucs
       ON ucs.user_id=er.user_id AND ucs.capability_node_id=er.capability_node_id
     WHERE er.id=$1 AND er.user_id=$2
     ON CONFLICT (evidence_id) DO UPDATE
       SET revoked_at=NULL
     RETURNING token`,
    [evidenceId,s.userId]
   );
   if(!result.rows.length)return NextResponse.json({error:'Evidence not found'},{status:404});
   const token=result.rows[0].token;
   return NextResponse.json({token,sharePath:`/evidence/inspect/${token}`});
  });
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const status=message==='UNAUTHORIZED'?401:500;
  return NextResponse.json({error:status===401?'Unauthorized':'Unable to create public inspection link'},{status});
 }
}
