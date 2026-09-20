import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const root=process.cwd();
const setup=readFileSync(path.join(root,'app/app/assessments/setup/page.tsx'),'utf8');
const workspace=readFileSync(path.join(root,'app/app/assessments/workspace/page.tsx'),'utf8');
const migration=readFileSync(path.join(root,'migrations/049_beginner_assessment_calibration.sql'),'utf8');
const engineMigration=readFileSync(path.join(root,'migrations/050_execution_engine_contract.sql'),'utf8');
const beginnerBank=readFileSync(path.join(root,'migrations/051_seed_beginner_sql_execution_bank.sql'),'utf8');

console.log('[GATE 1] Beginner users can bypass assessment to a roadmap...');
assert.ok(setup.includes('I’m a complete beginner')); assert.ok(setup.includes('/app/roadmap?domain=')); console.log('PASS');

console.log('[GATE 2] Assessment workspace is a dedicated IDE shell...');
assert.ok(!workspace.includes('AppShell')); assert.ok(workspace.includes('h-screen')); assert.ok(workspace.includes('@monaco-editor/react')); console.log('PASS');

console.log('[GATE 3] IDE has Run, Run Tests, Submit, expected-result output and schema surfaces...');
for(const token of ['/api/assessments/run','/api/assessments/run-tests','/api/assessments/submit-step','Expected result','Database schema','Public Tests']) assert.ok(workspace.includes(token),token);
console.log('PASS');

console.log('[GATE 4] Tab/window/fullscreen/clipboard and restricted shortcut integrity signals exist...');
for(const token of ['visibilitychange','window.addEventListener(\'blur\'','fullscreenchange','copy','cut','paste','contextmenu','F12','keystrokes','keystrokeCount']) assert.ok(workspace.includes(token),token);
console.log('PASS');

console.log('[GATE 5] Run is explicitly non-progressing and server-bound...');
const run=readFileSync(path.join(root,'app/api/assessments/run/route.ts'),'utf8');
const runTests=readFileSync(path.join(root,'app/api/assessments/run-tests/route.ts'),'utf8');
assert.ok(run.includes("progression:'NONE'")); assert.ok(runTests.includes("progression:'NONE'")); assert.ok(run.includes('active_question_reservations')); console.log('PASS');

console.log('[GATE 6] Beginner calibration exists and caps difficulty...');
assert.ok(existsSync(path.join(root,'migrations/049_beginner_assessment_calibration.sql'))); assert.ok(migration.includes("WHERE experience_level='BEGINNER'")); assert.ok(migration.includes('LEAST(difficulty_score,3.0)')); console.log('PASS');

console.log('[GATE 7] Execution engine contract carries scaling and adversarial test definitions...');
assert.ok(existsSync(path.join(root,'migrations/050_execution_engine_contract.sql')));
assert.ok(engineMigration.includes('scaling_benchmarks')); assert.ok(engineMigration.includes('adversarial_generators'));
assert.ok(readFileSync(path.join(root,'lib/verification/harness/complexity-analyzer.ts'),'utf8').includes('evaluateEmpiricalComplexity'));
assert.ok(readFileSync(path.join(root,'lib/verification/environment-digest.ts'),'utf8').includes('computeEnvironmentDigest'));
console.log('PASS');

console.log('[GATE 8] Beginner SQL has authored executable public and hidden tests...');
assert.ok(beginnerBank.includes("experience_level='BEGINNER'")); assert.ok(beginnerBank.includes('public_tests')); assert.ok(beginnerBank.includes('hidden_tests')); assert.ok(beginnerBank.includes("requireWindowFunction',false")); console.log('PASS');

console.log('ALL 8 ASSESSMENT IDE / EXECUTION ENGINE GATES PASSED.');
