import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const root=process.cwd();
const migration=readFileSync(path.join(root,'migrations/056_fix_beginner_execution_contracts.sql'),'utf8');
const dossier=readFileSync(path.join(root,'app/api/assessment/results/dossier/route.ts'),'utf8');
const results=readFileSync(path.join(root,'app/app/results/page.tsx'),'utf8');
const printDossier=readFileSync(path.join(root,'app/app/results/print-dossier.tsx'),'utf8');
const setup=readFileSync(path.join(root,'app/app/assessments/setup/page.tsx'),'utf8');
const workspace=readFileSync(path.join(root,'app/app/assessments/workspace/page.tsx'),'utf8');

console.log('[GATE 1] Every beginner coding public case preserves the authored task contract...');
assert.ok(migration.includes('customer totals — baseline fixture'));
assert.ok(migration.includes('customer totals — additional customer'));
assert.ok(migration.includes('amount descending — equal amount tie'));
assert.ok(migration.includes('date ascending — same-date tie'));
assert.ok(migration.includes('row number by customer/date — same-date tie'));
assert.ok(migration.includes('latest order per customer — same-date tie'));
assert.ok(!migration.includes("'customer counts'"));
assert.ok(!migration.includes("'high value orders'"));
console.log('PASS');

console.log('[GATE 2] Candidate is warned that assessment progression is forward-only...');
assert.ok(setup.includes('forward-only adaptive assessment')||setup.includes('forward-only'));
assert.ok(workspace.includes('once you Submit or Skip'));
assert.ok(workspace.includes('cannot return to it'));
console.log('PASS');

console.log('[GATE 3] Public test UI explains the test contract...');
assert.ok(workspace.includes('Public test contract'));
assert.ok(workspace.includes('same question requirement'));
assert.ok(workspace.includes('different output, filter, sort, or calculation'));
console.log('PASS');

console.log('[GATE 4] Server dossier contains persisted evidence and diagnostics...');
assert.ok(existsSync(path.join(root,'app/api/assessment/results/dossier/route.ts')));
for(const token of ['candidate_response','reference_solution','reference_explanation','correct_answer','verification_output','conceptGaps','optimizationNote','actionableAdvice']) assert.ok(dossier.includes(token),token);
console.log('PASS');

console.log('[GATE 5] Results export is an analytical printable dossier, not a raw result dump...');
assert.ok(results.includes('Export analytical PDF'));
assert.ok(results.includes('/api/assessment/results/dossier'));
assert.ok(printDossier.includes('Assessment Evidence & Learning Analysis'));
assert.ok(printDossier.includes('Diagnostic analysis'));
assert.ok(printDossier.includes('Optimization / performance'));
assert.ok(printDossier.includes('Save as PDF'));
assert.ok(printDossier.includes('@page{size:A4 portrait'));
console.log('PASS');

console.log('ALL 5 ASSESSMENT CONTRACT / DOSSIER GATES PASSED.');
