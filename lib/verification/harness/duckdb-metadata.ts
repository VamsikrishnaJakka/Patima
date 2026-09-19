export interface ColumnMetadata{name:string;type:string}
export interface ExecutedQueryResult{rows:Record<string,unknown>[];columns:ColumnMetadata[]}
export async function executeWithDuckDbMetadata(conn:any,sql:string):Promise<ExecutedQueryResult>{
 const reader=await conn.runAndReadAll(sql);
 const rows=(reader.getRowObjects() as Record<string,unknown>[]).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase(),typeof v==='bigint'?Number(v):v instanceof Date?v.toISOString():v])));
 const meta=await conn.runAndReadAll('DESCRIBE '+sql.trim().replace(/;+$/,''));
 const columns=(meta.getRowObjects() as any[]).map(c=>({name:String(c.column_name).toLowerCase(),type:String(c.column_type).toUpperCase()}));
 return{rows,columns};
}