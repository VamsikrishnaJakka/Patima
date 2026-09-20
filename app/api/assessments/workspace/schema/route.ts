import {NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';
import {requireCandidate} from '@/lib/server-auth';
import {withSessionClient} from '@/lib/db';
import {DuckDBInstance} from '@duckdb/node-api';
import {handleRouteError} from '@/lib/api-errors';

export async function GET(request:Request){
  try{
    const candidate=await requireCandidate();
    const {searchParams}=new URL(request.url);
    const sessionId=searchParams.get('sessionId')||'';
    const variantId=searchParams.get('variantId')||'';
    if(!sessionId||!variantId) return NextResponse.json({error:'MISSING_REQUIRED_FIELDS'},{status:400});

    return await withSessionClient(candidate.userId,async(client)=>{
      const r=await client.query(`
        SELECT v.fixture_ddl,v.scenario_entity
        FROM question_variants v
        JOIN active_question_reservations ar ON ar.variant_id=v.id AND ar.session_id=$2
        JOIN assessment_sessions s ON s.id=ar.session_id AND s.user_id=$3
        WHERE v.id=$1 AND s.status='IN_PROGRESS' AND ar.expires_at>clock_timestamp()
      `,[variantId,sessionId,candidate.userId]);
      if(!r.rows.length) return NextResponse.json({error:'NOT_FOUND_OR_LEASE_EXPIRED'},{status:404});
      const {fixture_ddl,scenario_entity}=r.rows[0];
      const db=await DuckDBInstance.create(':memory:',{threads:'1',max_memory:'128MB'});
      const conn=await db.connect();
      try{
        await conn.run(`SET threads=1`);
        await conn.run(`SET memory_limit='128MB'`);
        await conn.run(fixture_ddl);
        const requestedTable=String(scenario_entity||'').replace(/[^A-Za-z0-9_]/g,'');
        const tables=await conn.runAndReadAll(`SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY table_name`);
        const available=(tables.getRowObjects() as any[]).map(x=>String(x.table_name));
        const tableName=available.includes(requestedTable)?requestedTable:(available.length===1?available[0]:available.find(x=>x==='customer_orders')||available[0]);
        if(!tableName) throw new Error('FIXTURE_CONTAINS_NO_TABLE');
        const desc=await conn.runAndReadAll(`DESCRIBE ${tableName}`);
        const columns=desc.getRowObjects() as any[];
        const previewSelect=columns.map(x=>`CAST("${String(x.column_name).replace(/"/g,'""')}" AS VARCHAR) AS "${String(x.column_name).replace(/"/g,'""')}"`).join(', ');
        const preview=await conn.runAndReadAll(`SELECT ${previewSelect} FROM "${tableName.replace(/"/g,'""')}" LIMIT 8`);
        return NextResponse.json({
          tableName,
          columns:desc.getRowObjects().map((x:any)=>({name:String(x.column_name),type:String(x.column_type)})),
          sampleData:(preview.getRowObjects() as any[]).map(row=>JSON.parse(JSON.stringify(row,(_key,value)=>typeof value==='bigint'?Number(value):value instanceof Date?value.toISOString():value)))
        });
      }finally{
        try{conn.disconnectSync()}catch{}
        try{db.closeSync()}catch{}
      }
    });
  }catch(error){return handleRouteError(error,'assessments/workspace/schema')}
}
