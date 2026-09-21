import {getAssessmentDisplayTitle}from '@/lib/assessment-catalog';
import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 try{
  const session=await requireCandidate();
  const sessionId=new URL(request.url).searchParams.get('sessionId');
  const rows=await withAuthenticatedClient(async(s,client)=>client.query(`
    SELECT
      a.id session_id, a.domain_slug, a.experience_level, a.target_role, a.seniority, a.target_role_source, a.seniority_source, a.status, a.outcome, a.submitted_at,
      cn.name capability, er.id evidence_id, er.verification_tier, er.summary, er.context,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'stepIndex',l.step_index,
            'variantId',l.variant_id,
            'question',v.prompt_markdown,
            'questionType',v.question_type,
            'responseMode',v.response_mode,
            'expectedTimeComplexity',v.expected_time_complexity,
            'expectedSpaceComplexity',v.expected_space_complexity,
            'candidateResponse',l.candidate_response,
            'isCorrect',l.is_correct,
            'timeTakenSeconds',l.time_taken_seconds,
            'verificationStatus',l.verification_status,
            'publicTestsPassed',l.public_tests_passed,
            'publicTestsTotal',l.public_tests_total,
            'hiddenTestsPassed',l.hidden_tests_passed,
            'hiddenTestsTotal',l.hidden_tests_total,
            'executionTimeMs',l.execution_time_ms,
            'verificationOutput',l.verification_output
          ) ORDER BY l.step_index
        )
        FROM assessment_adaptive_logs l
        JOIN question_variants v ON v.id=l.variant_id
        WHERE l.session_id=a.id
      ),'[]'::jsonb) AS question_report
    FROM assessment_sessions a
    JOIN capability_nodes cn ON cn.id=a.capability_node_id
    LEFT JOIN LATERAL (
      SELECT * FROM evidence_records er
      WHERE er.user_id=a.user_id AND er.capability_node_id=a.capability_node_id AND er.recorded_at>=a.created_at
      ORDER BY er.recorded_at DESC LIMIT 1
    ) er ON TRUE
    WHERE a.user_id=$1 AND a.status IN ('VERIFIED','SUBMITTED')
      AND ($2::uuid IS NULL OR a.id=$2::uuid)
    ORDER BY a.submitted_at DESC
  `,[s.userId,sessionId||null]));
  const results=rows.rows.map((row:any)=>({
   ...row,
   domain_title:getAssessmentDisplayTitle(row.domain_slug,row.experience_level),
   target_role:row.target_role_source==='USER_PROVIDED'?row.target_role:null,
   seniority:row.seniority_source==='USER_PROVIDED'?row.seniority:null
  }));
  return NextResponse.json({results},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const status=error instanceof Error&&error.message==='UNAUTHORIZED'?401:500;
  return NextResponse.json({error:status===401?'Unauthorized':'Unable to load assessment results'},{status});
 }
}