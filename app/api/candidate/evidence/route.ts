import {NextResponse} from 'next/server';
import {withAuthenticatedClient,requireCandidate} from '@/lib/server-auth';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  const session=await requireCandidate();
  const data=await withAuthenticatedClient(async(s,client)=>{
   const rows=await client.query(`
    SELECT er.id AS evidence_id,cn.slug,cn.name AS capability,ucs.state,
           er.verification_tier,er.recorded_at,er.summary,er.context,er.artifact_code,
           er.test_trace,er.peer_review_summary,er.artifact_sha256,er.merkle_root,
           er.attestation_signature,er.ast_fingerprint,er.behavioral_assertions,
           er.execution_trace_digest,er.assessment_session_id,
           COALESCE(runs.run_count,0)::int AS execution_run_count,
           COALESCE(runs.latest_execution_time_ms,0) AS latest_execution_time_ms
    FROM evidence_records er
    JOIN capability_nodes cn ON cn.id=er.capability_node_id
    LEFT JOIN user_capability_states ucs
      ON ucs.user_id=er.user_id AND ucs.capability_node_id=er.capability_node_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS run_count,
             (array_agg(aer.execution_time_ms ORDER BY aer.created_at DESC))[1] AS latest_execution_time_ms
      FROM assessment_execution_runs aer
      WHERE aer.session_id=er.assessment_session_id
    ) runs ON TRUE
    WHERE er.user_id=$1
    ORDER BY er.recorded_at DESC`,[s.userId]);

   return {evidence:rows.rows.map((r:any)=>({
    evidenceId:r.evidence_id,capability:r.capability,state:r.state||'PROVISIONAL',
    verificationTier:r.verification_tier,recordedAt:r.recorded_at,summary:r.summary,context:r.context,
    artifactCode:r.artifact_code,testTrace:r.test_trace||[],peerReviewSummary:r.peer_review_summary,
    artifactSha256:r.artifact_sha256,merkleRoot:r.merkle_root,attestationSignature:r.attestation_signature,
    astFingerprint:r.ast_fingerprint,behavioralAssertions:r.behavioral_assertions,
    executionTraceDigest:r.execution_trace_digest,assessmentSessionId:r.assessment_session_id,
    executionRunCount:Number(r.execution_run_count||0),latestExecutionTimeMs:r.latest_execution_time_ms==null?null:Number(r.latest_execution_time_ms)
   }))};
  });
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:500;
  return NextResponse.json({error:status===401?'Unauthorized':'Unable to load evidence'},{status});
 }
}
