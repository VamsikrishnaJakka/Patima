export interface ColumnMetadata{name:string;type:string}
export interface ExecutedQueryResult{rows:Record<string,unknown>[];columns:ColumnMetadata[]}

function getJsonRows(reader:any):Record<string,unknown>[]{
 const rows=typeof reader.getRowObjectsJson==='function'?reader.getRowObjectsJson():reader.getRowObjects();
 return rows as Record<string,unknown>[];
}

export async function executeWithDuckDbMetadata(conn:any,sql:string):Promise<ExecutedQueryResult>{
 const reader=await conn.runAndReadAll(sql);
 const rows=getJsonRows(reader).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase(),v])));
 const meta=await conn.runAndReadAll('DESCRIBE '+sql.trim().replace(/;+$/,''));
 const columns=(meta.getRowObjects() as any[]).map(c=>({name:String(c.column_name).toLowerCase(),type:String(c.column_type).toUpperCase()}));
 return{rows,columns};
}
