import{ExecutedQueryResult}from'./duckdb-metadata';
export interface EquivalenceVerdict{passed:boolean;reason?:string}
const compatible=(a:string,e:string)=>{if(a===e)return true;const i=new Set(['TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT']);if(i.has(a)&&i.has(e))return true;const base=(x:string)=>x.split('(')[0];const f=new Set(['FLOAT','DOUBLE','DECIMAL']);return f.has(base(a))&&f.has(base(e))};
const norm=(v:any)=>v===null||v===undefined?'NULL':v instanceof Date?v.toISOString():String(v).trim();
export function assertStrictEquivalence(a:ExecutedQueryResult,e:ExecutedQueryResult,ordered:boolean):EquivalenceVerdict{
 if(a.columns.length!==e.columns.length)return{passed:false,reason:'Column count mismatch: expected '+e.columns.length+', received '+a.columns.length+'.'};
 for(let i=0;i<e.columns.length;i++){if(a.columns[i].name!==e.columns[i].name)return{passed:false,reason:'Schema column position '+(i+1)+' mismatch: expected column '+e.columns[i].name+', received '+a.columns[i].name+'.'};if(!compatible(a.columns[i].type,e.columns[i].type))return{passed:false,reason:'Type mismatch on column '+e.columns[i].name+': expected '+e.columns[i].type+', received '+a.columns[i].type+'.'}}
 if(a.rows.length!==e.rows.length)return{passed:false,reason:'Row count mismatch: expected '+e.rows.length+' rows, received '+a.rows.length+'.'};
 const key=(r:any)=>JSON.stringify(e.columns.map(c=>norm(r[c.name]))),aa=ordered?a.rows:[...a.rows].sort((x,y)=>key(x).localeCompare(key(y))),ee=ordered?e.rows:[...e.rows].sort((x,y)=>key(x).localeCompare(key(y)));
 for(let i=0;i<ee.length;i++)for(const c of e.columns)if(norm(aa[i][c.name])!==norm(ee[i][c.name]))return{passed:false,reason:'Row '+(i+1)+' value mismatch on '+c.name};
 return{passed:true};
}