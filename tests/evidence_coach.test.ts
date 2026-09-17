import assert from 'node:assert/strict';
import {consultEvidenceCoach} from '../lib/agents/evidence-coach';

async function main(){
 const demonstrated=await consultEvidenceCoach({
  status:'DEMONSTRATED',domain:'sql.window_functions',astViolations:[],failedAssertions:[],candidateReasoning:'I use event_id as a stable tie breaker.',executionDurationMs:12,
 });
 assert.equal(demonstrated.provider,'fallback');
 assert.equal(demonstrated.gapAnalysis,null);
 assert.ok(demonstrated.proveItChallenge);

 const developing=await consultEvidenceCoach({
  status:'DEVELOPING',domain:'sql.window_functions',astViolations:['missing event_id tie breaker'],failedAssertions:['Timestamp tie retains both events'],candidateReasoning:'I ordered only by event_time.',executionDurationMs:20,
 });
 assert.equal(developing.provider,'fallback');
 assert.match(developing.gapAnalysis||'','event_id');
 assert.equal(developing.proveItChallenge,null);

 const bounded=await consultEvidenceCoach({
  status:'PROVISIONAL',domain:'x'.repeat(500),astViolations:Array.from({length:20},()=> 'x'.repeat(1000)),failedAssertions:Array.from({length:20},()=> 'y'.repeat(1000)),candidateReasoning:'z'.repeat(10000),executionDurationMs:NaN,
 });
 assert.equal(bounded.provider,'fallback');
 assert.ok(bounded.nextMilestone.length>0);
 console.log('Evidence Coach tests passed');
}

main().catch(error=>{console.error(error);process.exit(1);});
