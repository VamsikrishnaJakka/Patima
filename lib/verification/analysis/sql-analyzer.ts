import{parseFirst}from'pgsql-ast-parser';

export interface SqlStructuralAnalysis{
 complexityProfile:{theoreticalTime:'O(n)'|'O(n log n)'|'O(n^2)';theoreticalSpace:'O(1)'|'O(n)';rationale:string};
 detectedClauses:string[];partitionKeys:string[];orderKeys:string[];windowFrameExplicit:boolean;hasUnboundedPreceding:boolean;performanceObservations:string[];codeSmells:string[];
}

const identifiers=(value:string)=>{
 const keys:string[]=[];
 for(const part of value.split(',')){
  const match=part.trim().match(/^([a-zA-Z_][\\w$]*(?:\\.[a-zA-Z_][\\w$]*)?)/);
  if(match)keys.push(match[1]);
 }
 return keys;
};

export function analyzeSqlStructure(sql:string):SqlStructuralAnalysis{
 const detected=new Set<string>(),partitionKeys:string[]=[],orderKeys:string[]=[],observations:string[]=[],codeSmells:string[]=[];
 let frame=false,unbounded=false;
 try{parseFirst(sql)}catch{return{complexityProfile:{theoreticalTime:'O(n)',theoreticalSpace:'O(n)',rationale:'Unparseable query.'},detectedClauses:[],partitionKeys:[],orderKeys:[],windowFrameExplicit:false,hasUnboundedPreceding:false,performanceObservations:[],codeSmells:['Syntax prevents deep structural analysis.']}};

 for(const c of ['SELECT','FROM','WHERE','GROUP BY','HAVING','JOIN','ORDER BY','OVER','PARTITION BY'])if(new RegExp('\\\\b'+c.replace(' ','\\\\s+')+'\\\\b','i').test(sql))detected.add(c==='OVER'?'WINDOW (OVER)':c);
 if(/\\b(ROWS|RANGE)\\s+BETWEEN\\b/i.test(sql)){frame=true;detected.add('EXPLICIT_FRAME')}
 if(/\\bUNBOUNDED\\s+PRECEDING\\b/i.test(sql))unbounded=true;

 for(const match of sql.matchAll(/\\bOVER\\s*\\(([^)]*)\\)/gi)){
  const body=match[1];
  const partition=body.match(/\\bPARTITION\\s+BY\\s+(.+?)(?=\\bORDER\\s+BY\\b|\\bROWS\\b|\\bRANGE\\b|$)/i);
  const order=body.match(/\\bORDER\\s+BY\\s+(.+?)(?=\\bROWS\\b|\\bRANGE\\b|$)/i);
  if(partition)partitionKeys.push(...identifiers(partition[1]));
  if(order)orderKeys.push(...identifiers(order[1]));
 }

 let time:'O(n)'|'O(n log n)'|'O(n^2)'='O(n)',rationale='Linear scan without an explicit sort.';
 if(orderKeys.length||/\\bORDER\\s+BY\\b/i.test(sql)){time='O(n log n)';rationale='Sorting is required for ordered output or window evaluation.'}
 if(/\\bCROSS\\s+JOIN\\b/i.test(sql)||(/\\bJOIN\\b/i.test(sql)&&!/\\bON\\b/i.test(sql))){time='O(n^2)';rationale='A join without a predicate can create a Cartesian row expansion.';codeSmells.push('Join without a predicate may cause quadratic row growth.')}
 if(detected.has('WINDOW (OVER)')&&!frame)observations.push('Window frame is implicit. For cumulative windows, make ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW explicit when peer-row semantics matter.');
 if(detected.has('WHERE')&&detected.has('WINDOW (OVER)'))observations.push('Filtering before window evaluation can reduce rows participating in partitioning and sorting.');
 if(orderKeys.length&&partitionKeys.length===0)observations.push('Window ordering is present without a partition key; verify that a global window is intentional.');
 return{complexityProfile:{theoreticalTime:time,theoreticalSpace:'O(n)',rationale},detectedClauses:[...detected],partitionKeys:[...new Set(partitionKeys)],orderKeys:[...new Set(orderKeys)],windowFrameExplicit:frame,hasUnboundedPreceding:unbounded,performanceObservations:observations,codeSmells};
}
