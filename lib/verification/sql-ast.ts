import {astVisitor,parse,parseFirst} from 'pgsql-ast-parser';

export interface SqlAstRequirements {
  allowedTables:string[];
  requiredPartitions?:string[];
  requiredOrderings?:string[];
  requireWindowFunction?:boolean;
}

export interface SqlAstVerificationOptions {
  allowedTables?:string[];
  requireWindowFunction?:boolean;
  requiredPartitionColumns?:string[];
  requiredOrderColumns?:string[];
}

export interface AstValidationResult {
  valid:boolean;
  error?:string;
  detectedViolations:string[];
}

export interface SqlAstVerificationResult {
  valid:boolean;
  statementType:string;
  hasWindowFunction:boolean;
  hasPartitionByRequiredColumns:boolean;
  hasPartitionByUserId:boolean;
  hasDeterministicTieBreaker:boolean;
  windowFrameType:'RANGE'|'ROWS'|'DEFAULT';
  referencedTables:string[];
  astFingerprint:Record<string,unknown>;
  detectedViolations:string[];
}

const expressionName=(node:any):string=>{
  if(!node)return '';
  if(node.type==='ref')return String(node.name||'').toLowerCase();
  return '';
};

export function validateSqlAstPolicy(sql:string,reqs:SqlAstRequirements):AstValidationResult{
  const violations:string[]=[];
  const clean=sql.trim();
  const statements=parse(clean);
  if(statements.length!==1)return {valid:false,error:'SECURITY_VIOLATION: Exactly one SQL statement is required.',detectedViolations:['MULTI_STATEMENT_DETECTED']};
  let parsed:any;
  try{parsed=parseFirst(clean);}catch(error){
    const withoutFrame=clean.replace(/\bROWS\s+BETWEEN\s+UNBOUNDED\s+PRECEDING\s+AND\s+CURRENT\s+ROW\b/gi,'');
    if(withoutFrame!==clean){try{parsed=parseFirst(withoutFrame);}catch{}}
    if(!parsed)return {valid:false,error:`PARSE_ERROR: ${error instanceof Error?error.message:String(error)}`,detectedViolations:['SYNTAX_ERROR']};
  }
  try{
  const statementType=String(parsed?.type||'unknown');
  if(statementType!=='select'&&statementType!=='with'&&statementType!=='with recursive'){
    violations.push('POLICY_VIOLATION: Only SELECT or WITH ... SELECT is permitted.');
  }
  const allowed=new Set((reqs.allowedTables||[]).map(x=>x.toLowerCase()));
  const referenced=new Set<string>(),cteNames=new Set<string>(),partitions=new Set<string>(),orderings=new Set<string>();
  let hasWindow=false;
  const collectCtes=(node:any)=>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach(collectCtes);return;}
    if(node.type==='with')for(const item of node.bindings||node.ctes||[])if(item?.alias)cteNames.add(String(item.alias).toLowerCase());
    for(const value of Object.values(node))if(value&&typeof value==='object')collectCtes(value);
  };
  collectCtes(parsed);
  const visitor=astVisitor((v:any)=>({
    tableRef:(t:any)=>{const n=String(t?.name||'').toLowerCase();if(n)referenced.add(n);return v.super().tableRef(t);},
    call:(c:any)=>{
      if(c?.over){
        hasWindow=true;
        for(const p of c.over.partitionBy||[]){const n=expressionName(p);if(n)partitions.add(n);}
        for(const o of c.over.orderBy||[]){const n=expressionName(o.by);if(n)orderings.add(n);}
      }
      return v.super().call(c);
    }
  }));
  visitor.statement(parsed);
  for(const table of referenced)if(!allowed.has(table)&&!cteNames.has(table))violations.push(`UNAUTHORIZED_TABLE_ACCESS: '${table}'`);
  if(reqs.requireWindowFunction&&!hasWindow)violations.push('MISSING_WINDOW_CONSTRUCT: Query must contain an explicit OVER clause.');
  for(const p of reqs.requiredPartitions||[])if(!partitions.has(p.toLowerCase()))violations.push(`MISSING_PARTITION_KEY: Window must partition by '${p}'.`);
  for(const o of reqs.requiredOrderings||[])if(!orderings.has(o.toLowerCase()))violations.push(`MISSING_ORDER_KEY: Window must order by '${o}'.`);
  return {valid:violations.length===0,error:violations[0],detectedViolations:violations};
}

export function inspectSqlAst(sqlCode:string,options:SqlAstVerificationOptions={}):SqlAstVerificationResult{
  const reqs:SqlAstRequirements={
    allowedTables:options.allowedTables||['user_events','test_events'],
    requireWindowFunction:options.requireWindowFunction!==false,
    requiredPartitions:options.requiredPartitionColumns||['user_id'],
    requiredOrderings:options.requiredOrderColumns||['event_time','event_id']
  };
  let parsed:any;
  try{parsed=parseFirst(sqlCode);}catch(error){
    return {valid:false,statementType:'unknown',hasWindowFunction:false,hasPartitionByRequiredColumns:false,hasPartitionByUserId:false,hasDeterministicTieBreaker:false,windowFrameType:'DEFAULT',referencedTables:[],astFingerprint:{parseError:error instanceof Error?error.message:String(error)},detectedViolations:[`SQL Parse Failure: ${error instanceof Error?error.message:String(error)}`]};
  }
  const policy=validateSqlAstPolicy(sqlCode,reqs);
  let hasWindow=false; const partitions=new Set<string>(),orders=new Set<string>(),tables=new Set<string>(),windows:any[]=[];
  const visitor=astVisitor((v:any)=>({
    tableRef:(t:any)=>{const n=String(t?.name||'').toLowerCase();if(n)tables.add(n);return v.super().tableRef(t);},
    call:(c:any)=>{if(c?.over){hasWindow=true;const p=(c.over.partitionBy||[]).map((x:any)=>expressionName(x)).filter(Boolean);const o=(c.over.orderBy||[]).map((x:any)=>expressionName(x.by)).filter(Boolean);p.forEach((x:string)=>partitions.add(x));o.forEach((x:string)=>orders.add(x));windows.push({function:String(c.function?.name||'').toLowerCase(),partitionBy:p,orderBy:o});}return v.super().call(c);}
  }));
  visitor.statement(parsed);
  const statementType=String(parsed?.type||'unknown');
  const part= (reqs.requiredPartitions||[]).every(x=>partitions.has(x.toLowerCase()));
  const ord= (reqs.requiredOrderings||[]).every(x=>orders.has(x.toLowerCase()));
  const frame:string=/\bROWS\s+BETWEEN\b/i.test(sqlCode)?'ROWS':/\bRANGE\s+BETWEEN\b/i.test(sqlCode)?'RANGE':'DEFAULT';
  return {valid:policy.valid,statementType,hasWindowFunction:hasWindow,hasPartitionByRequiredColumns:part,hasPartitionByUserId:(reqs.requiredPartitions||[]).map(x=>x.toLowerCase()).includes('user_id')&&part,hasDeterministicTieBreaker:ord,windowFrameType:frame as any,referencedTables:[...tables].sort(),astFingerprint:{statementType,windows,referencedTables:[...tables].sort()},detectedViolations:policy.detectedViolations};
}
