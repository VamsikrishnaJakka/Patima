import{parseFirst,astVisitor}from'pgsql-ast-parser';

export interface SqlStructuralAnalysis{
 complexityProfile:{theoreticalTime:'O(n)'|'O(n log n)'|'O(n^2)';theoreticalSpace:'O(1)'|'O(n)';rationale:string};
 detectedClauses:string[];partitionKeys:string[];orderKeys:string[];windowFrameExplicit:boolean;hasUnboundedPreceding:boolean;performanceObservations:string[];codeSmells:string[];
}

export function analyzeSqlStructure(sql:string):SqlStructuralAnalysis{
 const detected=new Set<string>(),partitionKeys:string[]=[],orderKeys:string[]=[],observations:string[]=[],codeSmells:string[]=[];
 let frame=false,unbounded=false,ast:any;
 try{ast=parseFirst(sql)}catch{return{complexityProfile:{theoreticalTime:'O(n)',theoreticalSpace:'O(n)',rationale:'Unparseable query.'},detectedClauses:[],partitionKeys:[],orderKeys:[],windowFrameExplicit:false,hasUnboundedPreceding:false,performanceObservations:[],codeSmells:['Syntax prevents deep structural analysis.']}};
 const raw=sql.toUpperCase();
 for(const c of ['SELECT','FROM','WHERE','GROUP BY','HAVING','JOIN','ORDER BY','OVER','PARTITION BY'])if(new RegExp('\\b'+c.replace(' ','\\s+')+'\\b','i').test(sql))detected.add(c==='OVER'?'WINDOW (OVER)':c);
 if(/\b(ROWS|RANGE)\s+BETWEEN\b/i.test(sql)){frame=true;detected.add('EXPLICIT_FRAME')}
 if(/\bUNBOUNDED\s+PRECEDING\b/i.test(sql))unbounded=true;
 const visitor=astVisitor((v:any)=>({call:(c:any)=>{if(c?.over){for(const p of c.over.partitionBy||[])if(p?.type==='ref')partitionKeys.push(String(p.name));for(const o of c.over.orderBy||[])if(o?.by?.type==='ref')orderKeys.push(String(o.by.name))}return v.super().call(c)}}));
 visitor.statement(ast);
 let time:'O(n)'|'O(n log n)'|'O(n^2)'='O(n)',rationale='Linear scan without an explicit sort.';
 if(orderKeys.length||/\bORDER\s+BY\b/i.test(sql)){time='O(n log n)';rationale='Sorting is required for ordered output or window evaluation.'}
 if(/\bCROSS\s+JOIN\b/i.test(sql)||(/\bJOIN\b/i.test(sql)&&!/\b\bON\b/i.test(sql))){time='O(n^2)';rationale='A join without a predicate can create a Cartesian row expansion.';codeSmells.push('Join without a predicate may cause quadratic row growth.')}
 if(/\bWINDOW\s*\(OVER\)/i.test([...detected].join(' '))&&!frame)observations.push('Window frame is implicit. For cumulative windows, make ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW explicit when peer-row semantics matter.');
 if(detected.has('WHERE')&&detected.has('WINDOW (OVER)'))observations.push('Filtering before window evaluation can reduce rows participating in partitioning and sorting.');
 if(orderKeys.length&&partitionKeys.length===0)observations.push('Window ordering is present without a partition key; verify that a global window is intentional.');
 return{complexityProfile:{theoreticalTime:time,theoreticalSpace:'O(n)',rationale},detectedClauses:[...detected],partitionKeys:[...new Set(partitionKeys)],orderKeys:[...new Set(orderKeys)],windowFrameExplicit:frame,hasUnboundedPreceding:unbounded,performanceObservations:observations,codeSmells};
}