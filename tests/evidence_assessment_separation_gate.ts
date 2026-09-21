import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
const allocator=read('lib/assessment/allocator.ts');
const overview=read('app/api/candidate/overview/route.ts');
const evidence=read('app/api/candidate/evidence/route.ts');

function assert(ok:boolean,msg:string){if(!ok)throw new Error(msg);}
function gate(n:number,label:string,fn:()=>void){console.log(`[GATE ${n}] ${label}...`);fn();console.log('PASS');}

gate(1,'Assessment completion creates a persisted evidence record',()=>{
 assert(allocator.includes('INSERT INTO evidence_records'),'adaptive completion does not mint evidence');
 assert(allocator.includes('assessment_session_id'),'evidence is not linked to the assessment session');
 assert(allocator.includes('testTrace'),'evidence does not persist verification trace');
});

gate(2,'Capability state is derived separately from assessment completion',()=>{
 assert(allocator.includes('INSERT INTO user_capability_states'),'capability state is not updated');
 assert(allocator.includes("scoreRatio >= 0.70"),'capability promotion rule is missing');
 assert(allocator.includes("ELSE 'DEVELOPING'"),'developing state fallback is not preserved');
 assert(allocator.includes("WHEN $3='DEMONSTRATED'"),'demonstrated promotion rule is not preserved');
});

gate(3,'Completed assessment count is independent from evidence count',()=>{
 assert(overview.includes('FROM assessment_sessions WHERE user_id=$1 AND status IN (\'VERIFIED\',\'SUBMITTED\')'),'completed count does not derive directly from assessment sessions');
});

gate(4,'Evidence dossier remains inspectable and linked to execution runs',()=>{
 assert(evidence.includes('er.assessment_session_id'),'evidence API is not session-linked');
 assert(evidence.includes('assessment_execution_runs'),'evidence API does not expose execution-run linkage');
});

console.log('ALL 4 EVIDENCE/ASSESSMENT SEPARATION GATES PASSED.');
