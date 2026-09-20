import crypto from 'node:crypto';
import{evaluateDynamicSql}from'./harness/sql-harness';
import{SubmissionEvaluationReport}from'./types';
import{SqlAstRequirements}from'./sql-ast';
import{getPinnedRuntime,computeEnvironmentDigest}from'./environment-digest';

export async function dispatchAuthenticVerification(req:{domain:string;candidateCode:string;variant:any}):Promise<SubmissionEvaluationReport>{
 if(req.domain!=='sql-window-functions')throw new Error('TRACK_DISABLED_PENDING_ISOLATED_HARNESS');
 const tests=[...(Array.isArray(req.variant.public_tests)?req.variant.public_tests:[]).map((t:any,i:number)=>({id:'pub_'+i,name:t.name||'Public Test '+(i+1),isPublic:true,fixtureDdl:t.fixture_ddl||req.variant.fixture_ddl,canonicalSql:t.canonical_sql,orderSensitive:t.order_sensitive??true})),...(Array.isArray(req.variant.hidden_tests)?req.variant.hidden_tests:[]).map((t:any,i:number)=>({id:'hid_'+i,name:t.name||'Hidden Boundary Case '+(i+1),isPublic:false,fixtureDdl:t.fixture_ddl||req.variant.fixture_ddl,canonicalSql:t.canonical_sql,orderSensitive:t.order_sensitive??true}))];
 if(!tests.length)throw new Error('NO_AUTHORED_TEST_CASES_CONFIGURED_FOR_VARIANT');
 const p=req.variant.verification_policy||{};const ast:SqlAstRequirements={allowedTables:Array.isArray(p.allowedTables)&&p.allowedTables.length?p.allowedTables:[req.variant.scenario_entity],requiredPartitions:Array.isArray(p.requiredPartitions)?p.requiredPartitions:undefined,requiredOrderings:Array.isArray(p.requiredOrderings)?p.requiredOrderings:undefined,requireWindowFunction:p.requireWindowFunction??true};
 const report=await evaluateDynamicSql(req.candidateCode,tests,ast);
 const runtime=getPinnedRuntime(req.domain);
 report.executionDigest=crypto.createHash('sha256').update(report.executionDigest+computeEnvironmentDigest(runtime)).digest('hex');
 return report;
}
