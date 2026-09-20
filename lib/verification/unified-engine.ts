import crypto from'node:crypto';
import{DuckDBInstance}from'@duckdb/node-api';
import{executeWithDuckDbMetadata,ExecutedQueryResult}from'./harness/duckdb-metadata';
import{executeWithSettledInterrupt}from'./harness/duckdb-interrupt';
import{validateSqlAstPolicy}from'./sql-ast';
import{EngineMode,UnifiedCase,UnifiedEngineResponse,DiffLocation}from'./unified-types';import{analyzeSqlStructure}from'./analysis/sql-analyzer';

type Variant={id:string;scenario_entity:string;fixture_ddl:string;public_tests:any[];hidden_tests:any[];verification_policy?:any};

export async function executeUnifiedEngine(req:{mode:EngineMode;sql:string;variant:Variant}):Promise<UnifiedEngineResponse>{
 const {mode,sql,variant}=req,start=performance.now();const structuralAnalysis=analyzeSqlStructure(sql);
 const policy=variant.verification_policy||{};
 const ast=validateSqlAstPolicy(sql,{
  allowedTables:Array.isArray(policy.allowedTables)&&policy.allowedTables.length?policy.allowedTables:[variant.scenario_entity],
  requiredPartitions:Array.isArray(policy.requiredPartitions)?policy.requiredPartitions:undefined,
  requiredOrderings:Array.isArray(policy.requiredOrderings)?policy.requiredOrderings:undefined,
  requireWindowFunction:policy.requireWindowFunction??false
 });
 if(!ast.valid){
  return {mode,verdict:'COMPILE_ERROR',runtimeMs:0,summary:{passed:0,total:1,publicPassed:0,publicTotal:1,hiddenPassed:0,hiddenTotal:0},cases:[{id:'ast-violation',name:'SQL Policy & Syntax',isPublic:true,status:'CE',executionTimeMs:0,diagnosticAdvice:ast.error,errorMessage:ast.error}],sqlAnalysis:{singleStatement:true,allowedTablesOnly:false,detectedClauses:[]},executionDigest:crypto.createHash('sha256').update(sql).digest('hex'),nextStepAvailable:false};
 }
 const publicCases=(variant.public_tests||[]).map((t:any,i:number)=>({...t,id:t.id||'public_'+i,isPublic:true,name:t.name||'Public Test '+(i+1),fixtureDdl:t.fixture_ddl||variant.fixture_ddl}));
 const hiddenCases=(variant.hidden_tests||[]).map((t:any,i:number)=>({...t,id:t.id||'hidden_'+i,isPublic:false,name:t.name||'Hidden Test '+(i+1),fixtureDdl:t.fixture_ddl||variant.fixture_ddl}));
 const targets=mode==='RUN'?[publicCases[0]||{id:'run_0',name:'Run',isPublic:true,fixtureDdl:variant.fixture_ddl,canonical_sql:null,order_sensitive:true}]:mode==='RUN_TESTS'?publicCases:[...publicCases,...hiddenCases];
 const cases:UnifiedCase[]=[];
 for(const tc of targets){
  let db:DuckDBInstance|undefined,c:any;const caseStart=performance.now();
  try{
   db=await DuckDBInstance.create(':memory:',{threads:'1',max_memory:'128MB',access_mode:'READ_WRITE'});c=db.connect();
   await c.runAndReadAll('SET threads=1');await c.runAndReadAll("SET memory_limit='128MB'");await c.runAndReadAll(tc.fixtureDdl);
   const input=await executeWithDuckDbMetadata(c,`SELECT * FROM ${variant.scenario_entity} LIMIT 8`);
   const actual=await executeWithSettledInterrupt(c,sql,2000);
   const actualRows=(actual.getRowObjects() as any[]).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase(),typeof v==='bigint'?Number(v):v instanceof Date?v.toISOString():v])));
   const meta=await c.runAndReadAll('DESCRIBE '+sql.trim().replace(/;+$/,''));
   const actualResult:ExecutedQueryResult={rows:actualRows,columns:(meta.getRowObjects() as any[]).map(x=>({name:String(x.column_name).toLowerCase(),type:String(x.column_type).toUpperCase()}))};
   const ms=Number((performance.now()-caseStart).toFixed(2));
   if(mode==='RUN'){
    cases.push({id:tc.id,name:tc.name,isPublic:true,status:'AC',executionTimeMs:ms,inputFixturePreview:{columns:input.columns.map(x=>x.name),rows:input.rows},actualOutputPreview:{columns:actualResult.columns.map(x=>x.name),rows:actualResult.rows.slice(0,8)}});
    continue;
   }
   const expected=await executeWithDuckDbMetadata(c,tc.canonical_sql);
   const diff=findDiff(actualResult,expected,tc.order_sensitive??true);
   cases.push({id:tc.id,name:tc.name,isPublic:tc.isPublic,status:diff?'WA':'AC',executionTimeMs:ms,inputFixturePreview:tc.isPublic?{columns:input.columns.map(x=>x.name),rows:input.rows}:undefined,expectedOutputPreview:tc.isPublic?{columns:expected.columns.map(x=>x.name),rows:expected.rows.slice(0,8)}:undefined,actualOutputPreview:tc.isPublic?{columns:actualResult.columns.map(x=>x.name),rows:actualResult.rows.slice(0,8)}:undefined,diff:tc.isPublic?(diff??undefined):undefined,diagnosticAdvice:diff?advice(diff,actualResult,expected):undefined});
  }catch(e){
   const ms=Number((performance.now()-caseStart).toFixed(2)),msg=e instanceof Error?e.message:String(e),tle=msg==='EXECUTION_TIMEOUT_INTERRUPTED';
   cases.push({id:tc.id,name:tc.name,isPublic:tc.isPublic,status:tle?'TLE':'RE',executionTimeMs:ms,diagnosticAdvice:tle?'Execution exceeded the 2000ms wall-clock limit.':msg,errorMessage:msg});
  }finally{try{c?.disconnectSync?.()}catch{}try{db?.closeSync?.()}catch{}}
 }
 const passed=cases.filter(x=>x.status==='AC').length,pub=cases.filter(x=>x.isPublic),hid=cases.filter(x=>!x.isPublic),all=cases.length>0&&passed===cases.length;
 const first=cases.find(x=>x.status!=='AC');
 const verdict=all?'ACCEPTED':first?.status==='TLE'?'TIME_LIMIT_EXCEEDED':first?.status==='RE'?'RUNTIME_ERROR':first?.status==='CE'?'COMPILE_ERROR':'WRONG_ANSWER';
 return {mode,verdict,runtimeMs:Number((performance.now()-start).toFixed(2)),summary:{passed,total:cases.length,publicPassed:pub.filter(x=>x.status==='AC').length,publicTotal:pub.length,hiddenPassed:hid.filter(x=>x.status==='AC').length,hiddenTotal:hid.length},cases,sqlAnalysis:{singleStatement:true,allowedTablesOnly:true,detectedClauses:structuralAnalysis.detectedClauses,performanceObservation:first?'See failing case diagnosis.':undefined,complexity:structuralAnalysis.complexityProfile,partitionKeys:structuralAnalysis.partitionKeys,orderKeys:structuralAnalysis.orderKeys,windowFrameExplicit:structuralAnalysis.windowFrameExplicit,hasUnboundedPreceding:structuralAnalysis.hasUnboundedPreceding,observations:structuralAnalysis.performanceObservations,codeSmells:structuralAnalysis.codeSmells},executionDigest:crypto.createHash('sha256').update(sql+JSON.stringify(cases)).digest('hex'),nextStepAvailable:mode==='SUBMIT'&&all};
}

function findDiff(actual:ExecutedQueryResult,expected:ExecutedQueryResult,orderSensitive:boolean):DiffLocation|null{
 if(actual.columns.map(x=>x.name).join('|')!==expected.columns.map(x=>x.name).join('|'))return{rowIndex:1,columnName:'[COLUMNS]',expectedValue:expected.columns.map(x=>x.name).join(', '),actualValue:actual.columns.map(x=>x.name).join(', ')};
 if(actual.rows.length!==expected.rows.length)return{rowIndex:Math.min(actual.rows.length,expected.rows.length)+1,columnName:'[ROW_COUNT]',expectedValue:`${expected.rows.length} rows`,actualValue:`${actual.rows.length} rows`};
 const rows=orderSensitive?actual.rows.map((r,i)=>[r,i] as const):actual.rows;
 for(let i=0;i<expected.rows.length;i++)for(const col of expected.columns){
  const a=String((rows[i]?.[col.name])??'NULL'),e=String(expected.rows[i]?.[col.name]??'NULL');if(a!==e)return{rowIndex:i+1,columnName:col.name,expectedValue:e,actualValue:a};
 }
 return null;
}
function advice(d:DiffLocation,a:ExecutedQueryResult,e:ExecutedQueryResult){if(d.columnName==='[ROW_COUNT]')return `Returned ${a.rows.length} rows, expected ${e.rows.length}. Check WHERE filters or GROUP BY granularity.`;if(d.columnName==='[COLUMNS]')return 'The selected columns do not match the expected result contract.';return `Mismatch at row ${d.rowIndex}, column '${d.columnName}'. Check filtering, ordering, aggregation, or window boundaries.`;}
function detectClauses(sql:string){return ['SELECT','FROM','WHERE','GROUP BY','HAVING','ORDER BY','JOIN','OVER','PARTITION BY'].filter(x=>new RegExp('\\b'+x.replace(' ','\\s+')+'\\b','i').test(sql));}
