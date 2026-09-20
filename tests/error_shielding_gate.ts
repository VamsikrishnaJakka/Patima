import assert from'node:assert/strict';import{handleRouteError}from'../lib/api-errors';
async function read(r:Response){return await r.json() as Record<string,unknown>}
async function run(){
 console.log('[GATE 1] Unexpected internal errors are opaque...');
 const body=await read(handleRouteError(new Error('DuckDB syntax error SELECT pg_catalog.secret /home/patima/runtime.ts:77'),'assessments/verify'));
 assert.deepEqual(body,{error:'INTERNAL_SERVER_ERROR',code:'UNEXPECTED_PROCESSING_FAULT'});
 console.log('PASS: internal diagnostics are not returned.');
 console.log('[GATE 2] Allowlisted application errors retain safe codes...');
 for(const [m,s] of [['UNAUTHORIZED',401],['VARIANT_NOT_FOUND_OR_LEASE_EXPIRED',404],['SESSION_ALREADY_ACTIVE',409],['RESERVATION_EXPIRED_OR_MISMATCH',409],['STEP_ALREADY_FINALIZED',409],['SUBMISSION_VERIFICATION_FAILED',422],['MISSING_REQUIRED_FIELDS',400],['TRACK_DISABLED_PENDING_ISOLATED_HARNESS',422]] as [string,number][]){const r=handleRouteError(new Error(m),'assessments/security-gate');const b=await read(r);assert.equal(r.status,s);assert.equal(b.error,m)}
 console.log('PASS: safe application errors map to explicit statuses.');
 console.log('[GATE 3] Diagnostic-pattern sweep...');
 const b=await read(handleRouteError(new Error('syntax error SELECT pg_catalog.secret /home/patima/lib/runtime.ts'),'assessments/submit-step'));const raw=JSON.stringify(b).toLowerCase();for(const n of ['duckdb','syntax error','pg_','select','/home/'])assert.equal(raw.includes(n),false,`Leaked diagnostic token: ${n}`);
 console.log('PASS: engine/schema/path patterns are absent.');console.log('ALL 3 ERROR SHIELDING GATES PASSED.');
}
run().catch(e=>{console.error('GATE FAILURE:',e);process.exit(1)});
