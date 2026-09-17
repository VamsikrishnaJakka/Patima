import process from 'node:process';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL){console.error('[PATIMA] DATABASE_URL is required for hiring tests.');process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const checks=[];
async function check(name,fn){try{await fn();checks.push(`PASS ${name}`);}catch(error){checks.push(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`);}}
try{
 await check('required tables exist',async()=>{const r=await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])`,[['user_accounts','app_sessions','employer_accounts','employer_members','candidate_visibility_settings','candidate_employer_authorizations','candidate_contact_intents','evidence_access_events','capability_nodes','user_capability_states','evidence_records']]);if(r.rows.length!==11)throw new Error(`expected 11 tables, found ${r.rows.length}`);});
 await check('canonical capability taxonomy is seeded',async()=>{const r=await pool.query(`SELECT COUNT(*)::int count FROM capability_nodes WHERE slug=ANY($1::text[])`,[['sql.window_functions','python.concurrency.rate_limiter','distributed_systems.consensus.raft','data_engineering.streaming']]);if(r.rows[0].count!==4)throw new Error('canonical capability set incomplete');});
 await check('candidate cannot satisfy missing capability',async()=>{const r=await pool.query(`SELECT ucs.user_id FROM user_capability_states ucs JOIN capability_nodes cn ON cn.id=ucs.capability_node_id WHERE cn.slug=ANY($1::text[]) AND ucs.state='DEMONSTRATED' GROUP BY ucs.user_id HAVING COUNT(DISTINCT cn.slug)=2`,[['sql.window_functions','distributed_systems.consensus.raft']]);if(r.rows.length)throw new Error('conjunctive query returned an incomplete candidate');});
 await check('RLS is forced on protected tables',async()=>{const r=await pool.query(`SELECT relname FROM pg_class WHERE relname=ANY($1::text[]) AND relforcerowsecurity`,[['candidate_visibility_settings','candidate_contact_intents','evidence_access_events','user_capability_states']]);if(r.rows.length!==4)throw new Error('one or more protected tables are not FORCE RLS');});
 await check('no active duplicate contact role',async()=>{const r=await pool.query(`SELECT employer_account_id,candidate_user_id,lower(role_title) role_title,COUNT(*) c FROM candidate_contact_intents WHERE status IN ('PENDING_CANDIDATE_APPROVAL','ACCEPTED') GROUP BY 1,2,3 HAVING COUNT(*)>1`);if(r.rows.length)throw new Error('duplicate active contact intent found');});
 console.log(checks.join('\n'));if(checks.some(x=>x.startsWith('FAIL ')))process.exitCode=1;
}finally{await pool.end();}
