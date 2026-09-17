import process from 'node:process';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL){console.error('[PATIMA] DATABASE_URL is required for Cycle 16 verification.');process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const checks=[];
async function check(name,fn){try{await fn();checks.push(`PASS ${name}`)}catch(error){checks.push(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`)}}
try{
 await check('schema migrations are applied',async()=>{const r=await pool.query(`SELECT version FROM schema_migrations WHERE version=ANY($1::text[])`,[['028','029','030']]);if(r.rows.length!==3)throw new Error(`expected migrations 028-030, found ${r.rows.length}`)});
 await check('protected tables use FORCE RLS',async()=>{const names=['candidate_visibility_settings','candidate_contact_intents','evidence_access_events','user_capability_states','candidate_employer_authorizations','evidence_records'];const r=await pool.query(`SELECT relname FROM pg_class WHERE relname=ANY($1::text[]) AND relforcerowsecurity`,[names]);if(r.rows.length!==names.length)throw new Error('protected table missing FORCE RLS')});
 await check('canonical taxonomy has four nodes',async()=>{const r=await pool.query(`SELECT COUNT(*)::int count FROM capability_nodes WHERE slug=ANY($1::text[])`,[['sql.window_functions','python.concurrency.rate_limiter','distributed_systems.consensus.raft','data_engineering.streaming']]);if(r.rows[0].count!==4)throw new Error('canonical capability set incomplete')});
 await check('conjunctive matching rejects incomplete proof',async()=>{const r=await pool.query(`WITH required AS (SELECT id FROM capability_nodes WHERE slug=ANY($1::text[])), matched AS (SELECT ucs.user_id FROM user_capability_states ucs JOIN required r ON r.id=ucs.capability_node_id WHERE ucs.state='DEMONSTRATED' GROUP BY ucs.user_id HAVING COUNT(DISTINCT ucs.capability_node_id)=(SELECT COUNT(*) FROM required)) SELECT user_id FROM matched WHERE user_id=$2`,[['sql.window_functions','distributed_systems.consensus.raft'],'c9a01f42-8812-4211-b0e1-482910482910']]);if(r.rows.length)throw new Error('incomplete candidate matched')});
 await check('active contact uniqueness index exists',async()=>{const r=await pool.query(`SELECT 1 FROM pg_indexes WHERE indexname='uq_active_employer_candidate_role'`);if(!r.rows.length)throw new Error('unique active contact index missing')});
 await check('weekly contact quota trigger exists',async()=>{const r=await pool.query(`SELECT 1 FROM pg_trigger WHERE tgname='trg_weekly_contact_quota' AND NOT tgisinternal`);if(!r.rows.length)throw new Error('quota trigger missing')});
 await check('disclosure vocabulary is complete',async()=>{const r=await pool.query(`SELECT COUNT(DISTINCT disclosure_level)::int count FROM evidence_access_events`);await pool.query(`SELECT unnest(ARRAY['LEVEL_1_SUMMARY','LEVEL_2_CONTEXT','LEVEL_3_CODE','LEVEL_4_INTEGRITY'])`);if(r.rows[0].count>4)throw new Error('invalid disclosure level stored')});
 console.log(checks.join('\n'));if(checks.some(x=>x.startsWith('FAIL ')))process.exitCode=1;
}finally{await pool.end()}
