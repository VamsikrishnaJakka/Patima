import {NextResponse} from 'next/server';
import {requireCandidate} from '@/lib/server-auth';
import {executeUnifiedEngine} from '@/lib/verification/unified-engine';

export const dynamic='force-dynamic';

const fixtureDdl=[
  'CREATE TABLE customer_orders (customer_id INT, order_id INT, order_date DATE, amount NUMERIC(10,2), status TEXT);',
  "INSERT INTO customer_orders(customer_id,order_id,order_date,amount,status) VALUES",
  "(1,101,'2026-01-01',120.00,'PAID'),(1,102,'2026-01-03',80.00,'PAID'),(1,103,'2026-01-03',50.00,'REFUNDED'),(1,104,'2026-01-08',200.00,'PAID'),",
  "(2,201,'2026-01-02',90.00,'PAID'),(2,202,'2026-01-05',150.00,'PAID'),(2,203,'2026-01-05',70.00,'PAID'),(2,204,'2026-01-10',110.00,'CANCELLED');"
].join('\n');

export async function POST(request:Request){
  try{
    await requireCandidate();
    const body=await request.json();
    const sql=String(body?.sql||'').slice(0,20000);
    if(!sql.trim())return NextResponse.json({error:'SQL_REQUIRED'},{status:400});
    const result=await executeUnifiedEngine({
      mode:'RUN',
      sql,
      variant:{id:'patima-sql-sandbox',scenario_entity:'customer_orders',fixture_ddl:fixtureDdl,public_tests:[],hidden_tests:[]}
    });
    return NextResponse.json({
      verdict:result.verdict,runtimeMs:result.runtimeMs,summary:result.summary,
      output:result.cases[0]?.actualOutputPreview||null,
      sqlAnalysis:result.sqlAnalysis,
      errorMessage:result.cases[0]?.errorMessage||result.cases[0]?.diagnosticAdvice||null
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'Unable to run sandbox';
    const status=message==='UNAUTHORIZED'?401:500;
    return NextResponse.json({error:status===401?'Unauthorized':'Unable to run sandbox'},{status});
  }
}