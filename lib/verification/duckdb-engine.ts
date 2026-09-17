import crypto from 'node:crypto';
import {DuckDBInstance} from '@duckdb/node-api';
import {inspectSqlAst,SqlAstVerificationResult} from './sql-ast';

export interface BehavioralAssertionResult{name:string;passed:boolean;observedOutput:string;expectedOutput:string;durationMs:number;}
export interface IsolatedVerificationResult{allPassed:boolean;assertions:BehavioralAssertionResult[];executionDigest:string;astValidation:SqlAstVerificationResult;error?:string;}

const ZERO='0'.repeat(64);
const fixtureRows=[
 ['8f12a100-0001-4000-8000-000000000001','usr_1','2026-09-17 14:00:00','PAGE_VIEW'],
 ['8f12a100-0002-4000-8000-000000000002','usr_1','2026-09-17 14:15:00','CLICK'],
 ['8f12a100-0003-4000-8000-000000000003','usr_1','2026-09-17 14:15:00','CLICK'],
 ['8f12a100-0004-4000-8000-000000000004','usr_1','2026-09-17 15:00:00','PURCHASE'],
 ['8f12a100-0005-4000-8000-000000000005','usr_2','2026-09-17 14:00:00','PAGE_VIEW'],
];
const allowedFunctions=new Set(['lag','lead','sum','count','min','max','avg','coalesce','row_number','rank','dense_rank','ntile','date_trunc','extract']);
const assertion=(name:string,passed:boolean,observed:string,expected:string,durationMs:number):BehavioralAssertionResult=>({name,passed,observedOutput:observed,expectedOutput:expected,durationMs});

function validateExecutionSql(sql:string){
 if(sql.length>20000)throw new Error('SQL submission exceeds the execution size limit.');
 if(/;\s*\S/i.test(sql.replace(/;\s*$/,'')))throw new Error('Multiple SQL statements are not permitted.');
 if(/\b(pg_sleep|dblink|lo_import|lo_export|copy|create|alter|drop|insert|update|delete|truncate|vacuum|grant|revoke|set|reset|call|do|attach|detach|install|load|read_csv|read_json|read_parquet|httpfs)\b/i.test(sql))throw new Error('SQL contains an operation that is not permitted in the assessment sandbox.');
 const ast=inspectSqlAst(sql);
 if(!ast.valid)throw new Error(ast.detectedViolations.join(' '));
 const normalized=sql.trim().replace(/\s+/g,' ');
 for(const functionName of normalized.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)){
  const name=functionName[1].toLowerCase();
  if(['over','partition','order','between','rows','range','case','when','then','else','end','cast','filter'].includes(name))continue;
  if(!allowedFunctions.has(name))throw new Error(`Function ${name} is not permitted in the assessment sandbox.`);
 }
 return sql;
}

function normalizeRows(rows:Record<string,unknown>[]){
 return rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?Number(value):value instanceof Date?value.toISOString():value])));
}

export async function verifyCandidateSqlIsolated(candidateSql:string):Promise<IsolatedVerificationResult>{
 const astValidation=inspectSqlAst(candidateSql);
 if(!astValidation.valid)return {allPassed:false,assertions:[assertion('AST Static Boundary Verification',false,astValidation.detectedViolations.join('; '),'Clean AST within the assessment table allowlist',0)],executionDigest:ZERO,astValidation,error:'AST_VIOLATION'};
 let instance:DuckDBInstance|undefined;
 let connection:any;
 const assertions:BehavioralAssertionResult[]=[];
 const started=performance.now();
 try{
  const executable=validateExecutionSql(candidateSql);
  instance=await DuckDBInstance.create(':memory:',{threads:'1',max_memory:'128MB',access_mode:'READ_WRITE'});
  connection=await instance.connect();
  await connection.run(`CREATE TABLE user_events(event_id VARCHAR,user_id VARCHAR,event_time TIMESTAMP,event_type VARCHAR)`);
  const values=fixtureRows.map(row=>`('${row[0]}','${row[1]}',TIMESTAMP '${row[2]}','${row[3]}')`).join(',');
  await connection.run(`INSERT INTO user_events VALUES ${values}`);
  const executionStart=performance.now();
  const reader=await connection.runAndReadAll(executable);
  const duration=Math.round((performance.now()-executionStart)*100)/100;
  const rows=normalizeRows(reader.getRowObjects() as Record<string,unknown>[]);
  assertions.push(assertion('Five fixture rows returned',rows.length===5,`Returned ${rows.length} rows`,'Returned 5 rows',duration));
  const usr1=rows.filter(row=>String(row.user_id??'')==='usr_1'),usr2=rows.filter(row=>String(row.user_id??'')==='usr_2');
  assertions.push(assertion('Independent user partitions',usr1.length===4&&usr2.length===1,`usr_1=${usr1.length}, usr_2=${usr2.length}`,'usr_1=4, usr_2=1',duration));
  const sessionValues=usr1.map(row=>row.session_id).filter(value=>value!==null&&value!==undefined).map(String);
  assertions.push(assertion('Inactivity creates a second session',new Set(sessionValues).size===2,`usr_1 session values=${JSON.stringify(sessionValues)}`,'Exactly 2 session identifiers for usr_1',duration));
  const tieRows=usr1.filter(row=>String(row.event_time)==='2026-09-17T14:15:00.000Z'),tieIds=tieRows.map(row=>String(row.event_id));
  assertions.push(assertion('Timestamp tie retains both events',tieRows.length===2&&new Set(tieIds).size===2,`Tie rows=${tieRows.length}, unique ids=${new Set(tieIds).size}`,'Two distinct events at the same timestamp',duration));
  const executionDigest=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return {allPassed:assertions.every(item=>item.passed),assertions,executionDigest,astValidation};
 }catch(error){
  const duration=Math.round((performance.now()-started)*100)/100;
  const message=error instanceof Error?error.message:String(error);
  assertions.push(assertion('Isolated DuckDB execution',false,`Runtime execution error: ${message}`,'Clean execution against the controlled in-memory fixture',duration));
  return {allPassed:false,assertions,executionDigest:ZERO,astValidation,error:message};
 }finally{
  try{connection?.disconnectSync?.();}catch{}
 }
}
