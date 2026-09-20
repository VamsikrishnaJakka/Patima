import {NextResponse} from 'next/server';
import {requireCandidate} from '@/lib/server-auth';
import {withSessionClient} from '@/lib/db';
import {evaluateDynamicSql} from '@/lib/verification/harness/sql-harness';
import {getPinnedRuntime,computeEnvironmentDigest} from '@/lib/verification/environment-digest';
import {handleRouteError} from '@/lib/api-errors';

export async function POST(request:Request){
  try{
    const candidate=await requireCandidate();
    const body=await request.json();
    const sessionId=String(body.sessionId||'');
    const variantId=String(body.variantId||'');
    const code=String(body.code||'').slice(0,20000);
    if(!sessionId||!variantId||!code.trim()) return NextResponse.json({error:'MISSING_REQUIRED_FIELDS'},{status:400});

    return await withSessionClient(candidate.userId,async(client)=>{
      const q=await client.query(`
        SELECT v.*,f.domain
        FROM question_variants v
        JOIN question_families f ON f.id=v.family_id
        JOIN active_question_reservations r ON r.variant_id=v.id AND r.session_id=$2
        JOIN assessment_sessions s ON s.id=r.session_id AND s.user_id=$3
        WHERE v.id=$1 AND s.status='IN_PROGRESS' AND r.expires_at>clock_timestamp()
      `,[variantId,sessionId,candidate.userId]);
      if(!q.rows.length) return NextResponse.json({error:'VARIANT_NOT_FOUND_OR_LEASE_EXPIRED'},{status:404});

      const row=q.rows[0];
      if(row.domain!=='sql-window-functions') return NextResponse.json({error:'RUNNER_TRACK_NOT_ENABLED'},{status:409});

      const publicTests=Array.isArray(row.public_tests)?row.public_tests:[];
      if(!publicTests.length) return NextResponse.json({error:'NO_PUBLIC_TESTS_CONFIGURED'},{status:409});

      const first=publicTests[0];
      const report=await evaluateDynamicSql(code,[{
        id:'run_public_0',
        name:first.name||'Example run',
        isPublic:true,
        fixtureDdl:first.fixture_ddl||row.fixture_ddl,
        canonicalSql:first.canonical_sql,
        orderSensitive:first.order_sensitive??true
      }],{
        allowedTables:Array.isArray(row.verification_policy?.allowedTables)&&row.verification_policy.allowedTables.length?row.verification_policy.allowedTables:[row.scenario_entity],
        requiredPartitions:Array.isArray(row.verification_policy?.requiredPartitions)?row.verification_policy.requiredPartitions:undefined,
        requiredOrderings:Array.isArray(row.verification_policy?.requiredOrderings)?row.verification_policy.requiredOrderings:undefined,
        requireWindowFunction:row.verification_policy?.requireWindowFunction??true
      });

      const runtime=getPinnedRuntime(row.domain);
      return NextResponse.json({
        mode:'RUN',
        verdict:report.verdict,
        allPassed:report.allPassed,
        executionTimeMs:report.executionTimeMs,
        peakMemoryKb:report.peakMemoryKb,
        output:report.testCases[0]?.actualOutput||'',
        expectedOutput:report.testCases[0]?.expectedOutput||'',
        errorMessage:report.testCases[0]?.errorMessage||null,
        testCases:report.testCases.map(t=>({id:t.id,name:t.name,status:t.status,executionTimeMs:t.executionTimeMs,errorMessage:t.errorMessage})),
        runtime,
        environmentDigest:computeEnvironmentDigest(runtime),
        progression:'NONE',
      });
    });
  }catch(error){return handleRouteError(error,'assessments/run')}
}
