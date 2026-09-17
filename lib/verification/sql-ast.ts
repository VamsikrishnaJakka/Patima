import {parse,parseFirst} from 'pgsql-ast-parser';

export interface SqlAstVerificationResult {
 valid:boolean;
 statementType:string;
 hasWindowFunction:boolean;
 hasPartitionByUserId:boolean;
 hasDeterministicTieBreaker:boolean;
 windowFrameType:'RANGE'|'ROWS'|'DEFAULT';
 astFingerprint:Record<string,unknown>;
 detectedViolations:string[];
}

const nameOf=(node:any)=>typeof node?.name==='string'?node.name.toLowerCase():'';
const expressionName=(node:any)=>{
 if(!node)return '';
 if(node.type==='ref')return String(node.name||'').toLowerCase();
 if(node.type==='call')return String(node.function?.name||'').toLowerCase();
 return '';
};

export function inspectSqlAst(sqlCode:string):SqlAstVerificationResult{
 const violations:string[]=[];
 let hasWindowFunction=false;
 let hasPartitionByUserId=false;
 let hasDeterministicTieBreaker=false;
 let windowFrameType:'RANGE'|'ROWS'|'DEFAULT'='DEFAULT';
 const windows:Array<Record<string,unknown>>=[];
 try{
  const statements=parse(sqlCode);
  if(statements.length!==1)throw new Error('Exactly one SQL statement is required.');
  const ast:any=parseFirst(sqlCode);
  const statementType=String(ast?.type||'unknown');
  if(statementType!=='select'&&statementType!=='with'&&statementType!=='with recursive'){
   violations.push('Submitted code must resolve to a SELECT or WITH ... SELECT statement.');
  }
  const visit=(node:any)=>{
   if(!node||typeof node!=='object')return;
   if(node.type==='call'&&node.over){
    hasWindowFunction=true;
    const over=node.over;
    const partitionNames=(over.partitionBy||[]).map((x:any)=>expressionName(x));
    const orderNames=(over.orderBy||[]).map((x:any)=>expressionName(x.by));
    if(partitionNames.includes('user_id'))hasPartitionByUserId=true;
    if(orderNames.includes('event_time')&&orderNames.includes('event_id'))hasDeterministicTieBreaker=true;
    windows.push({function:expressionName(node),partitionBy:partitionNames,orderBy:orderNames});
   }
   for(const value of Object.values(node)){
    if(value&&typeof value==='object'){
     if(Array.isArray(value))value.forEach(visit);else visit(value);
    }
   }
  };
  visit(ast);
  if(!hasWindowFunction)violations.push('AST Error: No window function (OVER clause) found in submission.');
  if(!hasPartitionByUserId)violations.push('AST Error: Window definition missing PARTITION BY user_id.');
  if(!hasDeterministicTieBreaker)violations.push('AST Violation: Window ordering must include event_time and stable event_id tie-breaker.');
  const normalized=JSON.stringify(windows);
  const hasExplicitRows=/\bROWS\s+BETWEEN\b/i.test(sqlCode);
  const hasExplicitRange=/\bRANGE\s+BETWEEN\b/i.test(sqlCode);
  if(hasExplicitRows)windowFrameType='ROWS'; else if(hasExplicitRange)windowFrameType='RANGE';
  return {valid:violations.length===0,statementType,hasWindowFunction,hasPartitionByUserId,hasDeterministicTieBreaker,windowFrameType,astFingerprint:{statementType,windows,windowCount:windows.length,normalized},detectedViolations:violations};
 }catch(error){
  return {valid:false,statementType:'unknown',hasWindowFunction:false,hasPartitionByUserId:false,hasDeterministicTieBreaker:false,windowFrameType:'DEFAULT',astFingerprint:{parseError:error instanceof Error?error.message:String(error)},detectedViolations:[`SQL Parse Failure: ${error instanceof Error?error.message:String(error)}`]};
 }
}
