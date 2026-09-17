import {astVisitor,parse,parseFirst} from 'pgsql-ast-parser';

export const ALLOWED_SQL_TABLES=new Set(['user_events','test_events']);

export interface SqlAstVerificationResult{
 valid:boolean;
 statementType:string;
 hasWindowFunction:boolean;
 hasPartitionByUserId:boolean;
 hasDeterministicTieBreaker:boolean;
 windowFrameType:'RANGE'|'ROWS'|'DEFAULT';
 referencedTables:string[];
 astFingerprint:Record<string,unknown>;
 detectedViolations:string[];
}

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
 const referencedTables=new Set<string>();
 try{
  const statements=parse(sqlCode);
  if(statements.length!==1)throw new Error('Exactly one SQL statement is required.');
  const ast:any=parseFirst(sqlCode);
  const statementType=String(ast?.type||'unknown');
  if(statementType!=='select'&&statementType!=='with'&&statementType!=='with recursive')violations.push('Submitted code must resolve to a SELECT or WITH ... SELECT statement.');

  const visitor=astVisitor((map:any)=>({
   tableRef:(table:any)=>{const name=String(table?.name||'').toLowerCase();if(name)referencedTables.add(name);return map.super().tableRef(table);},
   call:(node:any)=>{
    if(node?.over){
     hasWindowFunction=true;
     const over=node.over;
     const partitionNames=(over.partitionBy||[]).map((x:any)=>expressionName(x));
     const orderNames=(over.orderBy||[]).map((x:any)=>expressionName(x.by));
     if(partitionNames.includes('user_id'))hasPartitionByUserId=true;
     if(orderNames.includes('event_time')&&orderNames.includes('event_id'))hasDeterministicTieBreaker=true;
     windows.push({function:expressionName(node),partitionBy:partitionNames,orderBy:orderNames});
    }
    return map.super().call(node);
   },
  }));
  visitor.statement(ast);

  const cteNames=new Set<string>();
  const collectCtes=(node:any)=>{
   if(!node||typeof node!=='object')return;
   if(Array.isArray(node)){node.forEach(collectCtes);return;}
   if(node.type==='with'){
    for(const item of node.bindings||node.ctes||[])if(item?.alias)cteNames.add(String(item.alias).toLowerCase());
   }
   for(const value of Object.values(node))if(value&&typeof value==='object')collectCtes(value);
  };
  collectCtes(ast);
  const unauthorized=[...referencedTables].filter(name=>!ALLOWED_SQL_TABLES.has(name)&&!cteNames.has(name));
  if(unauthorized.length)violations.push(`AST table allowlist violation: unauthorized table reference(s): ${unauthorized.join(', ')}.`);
  if(!hasWindowFunction)violations.push('AST Error: No window function (OVER clause) found in submission.');
  if(!hasPartitionByUserId)violations.push('AST Error: Window definition missing PARTITION BY user_id.');
  if(!hasDeterministicTieBreaker)violations.push('AST Violation: Window ordering must include event_time and stable event_id tie-breaker.');
  const hasExplicitRows=/\bROWS\s+BETWEEN\b/i.test(sqlCode);
  const hasExplicitRange=/\bRANGE\s+BETWEEN\b/i.test(sqlCode);
  if(hasExplicitRows)windowFrameType='ROWS';else if(hasExplicitRange)windowFrameType='RANGE';
  const normalized=JSON.stringify({statementType,windows,referencedTables:[...referencedTables].sort()});
  return {valid:violations.length===0,statementType,hasWindowFunction,hasPartitionByUserId,hasDeterministicTieBreaker,windowFrameType,referencedTables:[...referencedTables].sort(),astFingerprint:{statementType,windows,windowCount:windows.length,referencedTables:[...referencedTables].sort(),normalized},detectedViolations:violations};
 }catch(error){
  return {valid:false,statementType:'unknown',hasWindowFunction:false,hasPartitionByUserId:false,hasDeterministicTieBreaker:false,windowFrameType:'DEFAULT',referencedTables:[],astFingerprint:{parseError:error instanceof Error?error.message:String(error)},detectedViolations:[`SQL Parse Failure: ${error instanceof Error?error.message:String(error)}`]};
 }
}
