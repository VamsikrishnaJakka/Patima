import {verifyCandidateSqlIsolated} from '../lib/verification/duckdb-engine';

const validSql=`WITH ordered AS (
  SELECT event_id,user_id,event_time,event_type,
    LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time,event_id) AS previous_event_time
  FROM user_events
),
sessionized AS (
  SELECT event_id,user_id,event_time,event_type,
    SUM(CASE WHEN previous_event_time IS NOT NULL
      AND event_time - previous_event_time > INTERVAL '30 minutes'
      THEN 1 ELSE 0 END)
      OVER (PARTITION BY user_id ORDER BY event_time,event_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_id
  FROM ordered
)
SELECT event_id,user_id,event_time,event_type,session_id
FROM sessionized
ORDER BY user_id,event_time,event_id`;

const checks:[string,()=>Promise<boolean>][]=[
 ['canonical valid solution',async()=>{const r=await verifyCandidateSqlIsolated(validSql);return r.astValidation.valid&&r.allPassed;}],
 ['unauthorized table access is rejected before execution',async()=>{const r=await verifyCandidateSqlIsolated(validSql.replace('FROM user_events','FROM user_events JOIN user_accounts ua ON true'));return !r.astValidation.valid&&r.astValidation.detectedViolations.some(v=>v.includes('user_accounts'));}],
 ['multi-statement input is rejected',async()=>{const r=await verifyCandidateSqlIsolated(`${validSql}; SELECT 1`);return !r.astValidation.valid;}],
 ['recursive runaway is bounded',async()=>{const recursive=`WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM t) SELECT row_number() OVER (PARTITION BY 1 ORDER BY n) AS rn,n FROM t`;const r=await verifyCandidateSqlIsolated(recursive);return !r.allPassed;}],
];

async function main(){
 let failed=0;
 for(const [name,run] of checks){
   try{
     const passed=await run();
     if(passed)console.log(`PASS ${name}`);
     else{console.error(`FAIL ${name}`); if(name==='canonical valid solution'){const r=await verifyCandidateSqlIsolated(validSql);console.error(JSON.stringify({error:r.error,ast:r.astValidation,assertions:r.assertions},null,2));} failed++;}
   }catch(error){
     console.error(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`);
     failed++;
   }
 }
 if(failed)process.exit(1);
 console.log('[PATIMA] Isolated SQL verification gate passed.');
}

void main().catch(error=>{
 console.error(`[PATIMA] Isolated SQL verification gate crashed: ${error instanceof Error?error.stack||error.message:String(error)}`);
 process.exit(1);
});
