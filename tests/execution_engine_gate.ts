import assert from 'node:assert/strict';
import {evaluateEmpiricalComplexity} from '../lib/verification/harness/complexity-analyzer';
import {computeEnvironmentDigest,getPinnedRuntime} from '../lib/verification/environment-digest';

console.log('[GATE 1] Complexity harness rejects materially super-linear scaling for an O(n log n) target...');
const bad=evaluateEmpiricalComplexity([{n:1000,timeMs:100},{n:10000,timeMs:5000},{n:100000,timeMs:500000}],'O(n log n)');
assert.equal(bad.passed,false);
console.log('PASS');

console.log('[GATE 2] Complexity harness accepts a reasonable O(n log n) empirical curve...');
const good=evaluateEmpiricalComplexity([{n:1000,timeMs:100},{n:10000,timeMs:1400},{n:100000,timeMs:17000}],'O(n log n)');
assert.equal(good.passed,true);
console.log('PASS');

console.log('[GATE 3] Runtime metadata is pinned and network-disabled...');
const runtime=getPinnedRuntime('sql-window-functions');
assert.equal(runtime.vCpuLimit,1);
assert.equal(runtime.memoryLimitMb,128);
assert.equal(runtime.networkEnabled,false);
assert.ok(runtime.engineVersion.length>0);
console.log('PASS');

console.log('[GATE 4] Runtime attestation is deterministic...');
assert.equal(computeEnvironmentDigest(runtime),computeEnvironmentDigest(runtime));
assert.equal(computeEnvironmentDigest(runtime).length,64);
console.log('PASS');

console.log('ALL 4 EXECUTION ENGINE GATES PASSED.');
