import {NextResponse} from 'next/server';
import {requireCandidate,withAuthenticatedClient} from '@/lib/server-auth';
import {handleRouteError} from '@/lib/api-errors';

export const dynamic='force-dynamic';
type DossierStatus='CORRECT'|'WRONG'|'SKIPPED'|'RECORDED';

export interface QuestionDossierItem {
 stepIndex:number; questionType:string; responseMode:string; conceptTag:string; promptMarkdown:string;
 candidateResponse:string; status:DossierStatus; durationSeconds:number; expectedTimeSeconds:number; difficultyPresented:number;
 publicTestsPassed:number; publicTestsTotal:number; hiddenTestsPassed:number; hiddenTestsTotal:number; executionTimeMs:number|null;
 expectedTimeComplexity:string|null; expectedSpaceComplexity:string|null; referenceSolution:string|null; referenceExplanation:string|null;
 correctAnswer:string|null; observedTimeComplexity:string|null; observedSpaceComplexity:string|null;
 analysis:{diagnosis:string;actionableAdvice:string;optimizationNote:string;evidence:string[]};
}
export interface AssessmentDossierResponse {
 session:{id:string;domain:string;domainTitle:string;targetRole:string|null;seniority:string|null;experienceLevel:string;startedAt:string;submittedAt:string|null;outcome:string;finalTheta:number|null;verificationTier:string};
 candidate:{id:string;name:string;handle:string};
 metrics:{totalQuestions:number;scoredCorrect:number;skipped:number;failed:number;recorded:number;totalDurationSeconds:number;averageTimePerQuestion:number};
 conceptGaps:Array<{concept:string;stepIndex:number;status:DossierStatus;reason:string}>;
 questions:QuestionDossierItem[];
}
function asObject(value:unknown):Record<string,any>{
 if(value&&typeof value==='object')return value as Record<string,any>;
 if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'?parsed:{};}catch{}}
 return {};
}
function sqlAnalysisFrom(output:unknown){
 const o=asObject(output),a=asObject(o.sqlAnalysis),c=asObject(a.complexity);
 return {analysis:a,observedTime:typeof c.theoreticalTime==='string'?c.theoreticalTime:null,observedSpace:typeof c.theoreticalSpace==='string'?c.theoreticalSpace:null};
}
export async function GET(request:Request){
 try{
  const auth=await requireCandidate();
  const sessionId=new URL(request.url).searchParams.get('sessionId')||'';
  if(!sessionId)return NextResponse.json({error:'MISSING_REQUIRED_FIELDS'},{status:400});
  const dossier=await withAuthenticatedClient(async(s,client)=>{
   const sessionQuery=await client.query(
    `SELECT s.id,s.domain,s.domain_slug,s.target_role,s.seniority,s.target_role_source,s.seniority_source,s.experience_level,s.status,s.started_at,s.submitted_at,s.outcome,s.final_theta,
            COALESCE(s.selected_question_count,5) AS total_questions,er.verification_tier,u.name,u.handle
     FROM assessment_sessions s JOIN user_accounts u ON u.id=s.user_id
     LEFT JOIN LATERAL (SELECT verification_tier FROM evidence_records WHERE assessment_session_id=s.id ORDER BY recorded_at DESC LIMIT 1) er ON TRUE
     WHERE s.id=$1 AND s.user_id=$2 LIMIT 1`,
    [sessionId,s.userId]
   );
   if(!sessionQuery.rows.length)throw new Error('SESSION_NOT_FOUND_OR_UNAUTHORIZED');
   const sess=sessionQuery.rows[0];
   const logs=await client.query(
    `SELECT l.step_index,l.candidate_response,l.is_correct,l.time_taken_seconds,l.difficulty_presented,l.public_tests_passed,l.public_tests_total,
            l.hidden_tests_passed,l.hidden_tests_total,l.execution_time_ms,l.verification_status,l.verification_output,
            v.prompt_markdown,v.expected_time_seconds,v.expected_time_complexity,v.expected_space_complexity,v.reference_solution,
            v.reference_explanation,v.correct_answer,COALESCE(v.question_type,'CODING') question_type,COALESCE(v.response_mode,'CODE') response_mode,f.concept_tag
     FROM assessment_adaptive_logs l JOIN question_variants v ON v.id=l.variant_id JOIN question_families f ON f.id=l.family_id
     WHERE l.session_id=$1 ORDER BY l.step_index ASC`,
    [sessionId]
   );
   let scoredCorrect=0,skipped=0,failed=0,recorded=0,totalDuration=0;
   const conceptGaps:AssessmentDossierResponse['conceptGaps']=[];
   const questions:QuestionDossierItem[]=logs.rows.map((row)=>{
    const output=asObject(row.verification_output),skippedRow=row.candidate_response==='[SKIPPED]'||row.verification_status==='SKIPPED';
    const isTheoryText=row.response_mode==='TEXT'&&row.is_correct===null&&!skippedRow;
    const status:DossierStatus=skippedRow?'SKIPPED':row.is_correct===true?'CORRECT':isTheoryText?'RECORDED':'WRONG';
    if(status==='SKIPPED')skipped++;else if(status==='CORRECT')scoredCorrect++;else if(status==='WRONG')failed++;else recorded++;
    const duration=Number(row.time_taken_seconds||0); totalDuration+=duration;
    const sql=sqlAnalysisFrom(output),firstFail=asObject(output.firstFailingTestCase);
    const observations=Array.isArray(sql.analysis.observations)?sql.analysis.observations.filter((x:any)=>typeof x==='string'):[];
    const smells=Array.isArray(sql.analysis.codeSmells)?sql.analysis.codeSmells.filter((x:any)=>typeof x==='string'):[];
    const evidence:string[]=[...observations,...smells];
    let diagnosis='',actionableAdvice='',optimizationNote='';
    if(status==='SKIPPED'){
     diagnosis='Question '+row.step_index+' was skipped, so this concept was not demonstrated.';
     actionableAdvice='Prepare the concept “'+String(row.concept_tag).replace(/_/g,' ')+'”. Study the exact task in this question, then solve at least 3 variations before retaking a similar assessment.';
     optimizationNote='Do not move on from a foundational topic without being able to explain the requested output, grouping/ordering rules, and edge cases.';
     conceptGaps.push({concept:row.concept_tag,stepIndex:Number(row.step_index),status,reason:'Skipped without demonstration'});
    }else if(status==='WRONG'){
     diagnosis=typeof firstFail.errorMessage==='string'&&firstFail.errorMessage?firstFail.errorMessage:'The submitted response did not satisfy the authored verification contract.';
     actionableAdvice=row.referenceExplanation||('Compare your response with the required output shape and the concept “'+String(row.concept_tag).replace(/_/g,' ')+'”.');
     optimizationNote=evidence.length?'After correcting the concept, review: '+evidence.join(' '):'Re-run the task, inspect the expected output, and verify every required column, filter, grouping key, ordering rule, and tie-breaker.';
     conceptGaps.push({concept:row.concept_tag,stepIndex:Number(row.step_index),status,reason:diagnosis});
    }else if(status==='RECORDED'){
     diagnosis='Written theory response recorded; this response mode is not automatically scored.';
     actionableAdvice='Review the concept “'+String(row.concept_tag).replace(/_/g,' ')+'” and compare your explanation with the authored reference guidance.';
     optimizationNote='For theory questions, be able to explain the concept, a concrete example, and the performance or correctness implication where applicable.';
    }else{
     diagnosis='The authored verification checks passed for this response.';
     actionableAdvice=row.referenceExplanation||('Your answer demonstrated the requested “'+String(row.concept_tag).replace(/_/g,' ')+'” concept.');
     optimizationNote=evidence.length?'Optimization headroom observed by the analyzer: '+evidence.join(' '):'Correctness was demonstrated. On larger data, review the query plan, data volume, partition/order keys, and whether unnecessary sorting or materialization can be reduced.';
    }
    return {
     stepIndex:Number(row.step_index),questionType:row.question_type,responseMode:row.response_mode,conceptTag:row.concept_tag,promptMarkdown:row.prompt_markdown,
     candidateResponse:row.candidate_response||'',status,durationSeconds:duration,expectedTimeSeconds:Number(row.expected_time_seconds||120),
     difficultyPresented:Number(row.difficulty_presented||0),publicTestsPassed:Number(row.public_tests_passed||0),publicTestsTotal:Number(row.public_tests_total||0),
     hiddenTestsPassed:Number(row.hidden_tests_passed||0),hiddenTestsTotal:Number(row.hidden_tests_total||0),
     executionTimeMs:row.execution_time_ms==null?null:Number(row.execution_time_ms),expectedTimeComplexity:row.expected_time_complexity,
     expectedSpaceComplexity:row.expected_space_complexity,referenceSolution:row.reference_solution,referenceExplanation:row.reference_explanation,
     correctAnswer:row.correct_answer,observedTimeComplexity:sql.observedTime,observedSpaceComplexity:sql.observedSpace,
     analysis:{diagnosis,actionableAdvice,optimizationNote,evidence}
    };
   });
   const totalQuestions=questions.length||Number(sess.total_questions);
   return {session:{id:sess.id,domain:sess.domain,domainTitle:getAssessmentDisplayTitle(sess.domain_slug||sess.domain,sess.experience_level),targetRole:sess.target_role_source==='USER_PROVIDED'?sess.target_role:null,
    seniority:sess.seniority_source==='USER_PROVIDED'?sess.seniority:null,experienceLevel:sess.experience_level,startedAt:sess.started_at,submittedAt:sess.submitted_at,outcome:sess.outcome||'PROVISIONAL',
    finalTheta:sess.final_theta==null?null:Number(sess.final_theta),verificationTier:sess.verification_tier||'PLATFORM_ATTESTED'},
    candidate:{id:s.userId,name:sess.name,handle:sess.handle},
    metrics:{totalQuestions,scoredCorrect,skipped,failed,recorded,totalDurationSeconds:totalDuration,averageTimePerQuestion:totalQuestions?Math.round(totalDuration/totalQuestions):0},
    conceptGaps,questions} satisfies AssessmentDossierResponse;
  });
  return NextResponse.json(dossier,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return handleRouteError(error,'assessment/results/dossier');}
}
