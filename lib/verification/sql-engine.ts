import crypto from 'node:crypto';
import {parseFirst} from 'pgsql-ast-parser';
import {PoolClient} from 'pg';

export interface BehavioralAssertionResult{
 name:string;
 passed:boolean;
 observedOutput:string;
 expectedOutput:string;
 durationMs:number;
}

export interface SqlExecutionVerification{
 allPassed:boolean;
 assertions:BehavioralAssertionResult[];
 executionDigest:string;
 astSafe:boolean;
}

const ZERO='0'.repeat(64);
const fixtureRows=[
 ['8f12a100-0001-4000-8000-000000000001','usr_1','2026-09-17 14:00:00+00','PAGE_VIEW'],
 ['8f12a100-0002-4000-8000-000000000002','usr_1','2026-09-17 14:15:00+00','CLICK'],
 ['8f12a100-0003-4000-8000-000000000003','usr_1','2026-09-17 14:15:00+00','CLICK'],
 ['8f12a100-0004-4000-8000-000000000004','usr_1','2026-09-17 15:00:00+00','PURCHASE'],
 ['8f12a100-0005-4000-8000-000000000005','usr_2','2026-09-17 14:00:00+00','PAGE_VIEW'],
];

function safeCandidateSql(sql:string){
 const ast:any=parseFirst(sql);
 const allowed=ast?.type==='select'||ast?.type==='with'||ast?.type==='with recursive';
 if(!allowed)throw new Error('Execution accepts only SELECT or WITH ... SELECT statements.');
 if(sql.length>20000)throw new Error('SQL submission exceeds the execution size limit.');
 if(/;\s*\S/i.test(sql.replace(/;\s*$/,'')))throw new Error('Multiple SQL statements are not permitted.');
 if(/\b(pg_sleep|dblink|lo_import|lo_export|copy|create|alter|drop|insert|update|delete|truncate|vacuum|grant|revoke)\b/i.test(sql))throw new Error('SQL contains an operation that is not permitted in the assessment sandbox.');
 if(!/\buser_events\b/i.test(sql))throw new Error('The SQL probe must read from the controlled user_events fixture.');
 return sql.replace(/\buser_events\b/gi,'patima_assessment_events');
}

function assertion(name:string,passed:boolean,observed:string,expected:string,durationMs:number):BehavioralAssertionResult{
 return {name,passed,observedOutput:observed,expectedOutput:expected,durationMs};
}

export async function executeBehavioralAssertions(client:PoolClient,candidateSql:string):Promise<SqlExecutionVerification>{
 const assertions:BehavioralAssertionResult[]=[];
 const started=performance.now();
 try{
  const executable=safeCandidateSql(candidateSql);
  await client.query(`SET LOCAL statement_timeout='3000ms'`);
  await client.query(`SET LOCAL lock_timeout='1000ms'`);
  await client.query(`SET LOCAL idle_in_transaction_session_timeout='5000ms'`);
  await client.query(`SET TRANSACTION READ ONLY`);
  await client.query(`CREATE TEMP TABLE patima_assessment_events(event_id UUID,user_id VARCHAR(32),event_time TIMESTAMPTZ,event_type VARCHAR(32)) ON COMMIT DROP`);
  for(const row of fixtureRows)await client.query('INSERT INTO patima_assessment_events(event_id,user_id,event_time,event_type) VALUES($1,$2,$3,$4)',row);
  const result=await client.query(executable);
  const duration=Math.round((performance.now()-started)*100)/100;
  const records=result.rows.map(row=>({
   user_id:row.user_id==null?null:String(row.user_id),
   session_id:row.session_id==null?null:String(row.session_id),
   event_id:row.event_id==null?null:String(row.event_id),
   event_time:row.event_time==null?null:new Date(row.event_time).toISOString(),
  }));
  assertions.push(assertion('Five fixture rows returned',records.length===5,`Returned ${records.length} rows`,'Returned 5 rows',duration));
  const usr1=records.filter(r=>r.user_id==='usr_1');
  const usr2=records.filter(r=>r.user_id==='usr_2');
  assertions.push(assertion('Independent user partitions',usr1.length===4&&usr2.length===1,`usr_1=${usr1.length}, usr_2=${usr2.length}`,'usr_1=4, usr_2=1',duration));
  const sessionValues=usr1.map(r=>r.session_id);
  const usr1Sessions=new Set(sessionValues);
  assertions.push(assertion('Inactivity creates a second session',usr1Sessions.size===2,`usr_1 session values=${JSON.stringify(sessionValues)}`,'Exactly 2 session identifiers for usr_1',duration));
  const tieRows=usr1.filter(r=>r.event_time==='2026-09-17T14:15:00.000Z');
  const tieIds=tieRows.map(r=>r.event_id).filter(Boolean);
  assertions.push(assertion('Timestamp tie retains both events',tieRows.length===2&&new Set(tieIds).size===2,`Tie rows=${tieRows.length}, unique ids=${new Set(tieIds).size}`,'Two distinct events at the same timestamp',duration));
  const executionDigest=crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
  return {allPassed:assertions.every(a=>a.passed),assertions,executionDigest,astSafe:true};
 }catch(error){
  const duration=Math.round((performance.now()-started)*100)/100;
  const message=error instanceof Error?error.message:String(error);
  assertions.push(assertion('Execution sandbox runtime',false,`Runtime execution error: ${message}`,'Clean execution with zero runtime errors',duration));
  return {allPassed:false,assertions,executionDigest:ZERO,astSafe:false};
 }
}
