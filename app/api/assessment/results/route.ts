import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export async function GET(){
 try{
  const session=await requireCandidate();
  const rows=await withAuthenticatedClient(async(s,client)=>client.query(`
    SELECT a.id session_id,a.domain_slug,a.target_role,a.seniority,a.outcome,a.submitted_at,
           cn.name capability,er.id evidence_id,er.verification_tier,er.summary,er.context,er.test_trace
    FROM assessment_sessions a
    JOIN capability_nodes cn ON cn.id=a.capability_node_id
    LEFT JOIN LATERAL (
      SELECT * FROM evidence_records er WHERE er.user_id=a.user_id AND er.capability_node_id=a.capability_node_id AND er.recorded_at>=a.created_at ORDER BY er.recorded_at DESC LIMIT 1
    ) er ON TRUE
    WHERE a.user_id=$1 AND a.status='VERIFIED'
    ORDER BY a.submitted_at DESC
  `,[s.userId]));
  return NextResponse.json({results:rows.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:500;
  return NextResponse.json({error:status===401?'Unauthorized':'Unable to load assessment results'},{status});
 }
}
