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
        const desc=await conn.runAndReadAll(`DESCRIBE ${String(scenario_entity).replace(/[^A-Za-z0-9_]/g,'')}`);
        const preview=await conn.runAndReadAll(`SELECT * FROM ${String(scenario_entity).replace(/[^A-Za-z0-9_]/g,'')} LIMIT 8`);
        return NextResponse.json({
          tableName:scenario_entity,
          columns:desc.getRowObjects().map((x:any)=>({name:String(x.column_name),type:String(x.column_type)})),
          sampleData:(preview.getRowObjects() as any[]).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?Number(value):value instanceof Date?value.toISOString():value])))
        });
      }finally{
        try{conn.disconnectSync()}catch{}
        try{db.closeSync()}catch{}
      }
    });
  }catch(error){return handleRouteError(error,'assessments/workspace/schema')}
}
