import pg from 'pg';
import process from 'node:process';
import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
loadEnvConfig(process.cwd());
const {Pool}=pg;
const url=process.env.DIRECT_URL||process.env.DATABASE_URL||'postgresql://postgres:postgres@localhost:5432/patima_dev';
const pool=new Pool({connectionString:url,max:1});
const checks=[];
async function check(name,sql,params=[],predicate=v=>Boolean(v)){const r=await pool.query(sql,params);const ok=predicate(r);checks.push([ok,name]);if(!ok)throw new Error(`FAIL ${name}`);console.log(`PASS ${name}`)}
try{
 await check('assessment migrations are applied',`SELECT COUNT(*)::int count FROM schema_migrations WHERE version IN ('033','034','035','036')`,[],r=>r.rows[0].count===4);
 await check('assessment sessions use FORCE RLS',`SELECT relforcerowsecurity FROM pg_class WHERE oid='assessment_sessions'::regclass`,[],r=>r.rows[0]?.relforcerowsecurity===true);
 await check('assessment sessions have expiry',`SELECT 1 FROM information_schema.columns WHERE table_name='assessment_sessions' AND column_name='expires_at'`);
 await check('assessment evidence is linked to sessions',`SELECT 1 FROM information_schema.columns WHERE table_name='evidence_records' AND column_name='assessment_session_id'`);
 await check('evidence stores AST fingerprint',`SELECT 1 FROM information_schema.columns WHERE table_name='evidence_records' AND column_name='ast_fingerprint'`);
 await check('evidence stores execution digest',`SELECT 1 FROM information_schema.columns WHERE table_name='evidence_records' AND column_name='execution_trace_digest'`);
 await check('execution runs are session-bound',`SELECT COUNT(*)::int count FROM information_schema.columns WHERE table_name='assessment_execution_runs' AND column_name IN ('session_id','probe_index','submitted_code','ast_tree','assertions_passed','assertions_total','execution_time_ms','output_hash')`,[],r=>r.rows[0].count===8);
 await check('execution runs use FORCE RLS',`SELECT relforcerowsecurity FROM pg_class WHERE oid='assessment_execution_runs'::regclass`,[],r=>r.rows[0]?.relforcerowsecurity===true);
 await check('candidate evidence insert policy binds session owner',`SELECT 1 FROM pg_policies WHERE tablename='evidence_records' AND policyname='p_evidence_records_candidate_insert'`);
 await check('candidate capability write policies exist',`SELECT COUNT(*)::int count FROM pg_policies WHERE tablename='user_capability_states' AND policyname IN ('p_capability_states_candidate_write','p_capability_states_candidate_update')`,[],r=>r.rows[0].count===2);
 await check('three canonical assessment probes remain available',`SELECT COUNT(*)::int count FROM (VALUES ('sql.window_functions'),('python.concurrency.rate_limiter'),('java.concurrency_memory'),('linux.process_signals'),('docker.container_internals')) v(slug) JOIN capability_nodes c ON c.slug=v.slug`,[],r=>r.rows[0].count===5);
 console.log('[PATIMA] Assessment integrity gate passed.');
}catch(error){console.error(`[PATIMA] Assessment integrity gate failed: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1}finally{await pool.end()}
