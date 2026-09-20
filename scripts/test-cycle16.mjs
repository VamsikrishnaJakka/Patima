import process from 'node:process';
import {loadEnvConfig} from '@next/env';
import pg from 'pg';
loadEnvConfig(process.cwd());

const {Pool}=pg;

if(!process.env.DATABASE_URL){
  console.error('[PATIMA] DATABASE_URL is required for Cycle 16 verification.');
  process.exit(1);
}

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const checks=[];

async function check(name,fn){
  try{
    await fn();
    checks.push(`PASS ${name}`);
  }catch(error){
    checks.push(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`);
  }
}

try{
  await check('schema migrations are applied',async()=>{
    const requiredVersions=['028','029','030','031'];
    const result=await pool.query(
      `SELECT version FROM schema_migrations WHERE version=ANY($1::text[])`,
      [requiredVersions],
    );
    if(result.rows.length!==requiredVersions.length){
      throw new Error(`expected migrations 028-031, found ${result.rows.length}`);
    }
  });

  await check('protected tables use FORCE RLS',async()=>{
    const names=[
      'candidate_visibility_settings',
      'candidate_contact_intents',
      'evidence_access_events',
      'user_capability_states',
      'candidate_employer_authorizations',
      'evidence_records',
    ];
    const result=await pool.query(
      `SELECT relname FROM pg_class WHERE relname=ANY($1::text[]) AND relforcerowsecurity`,
      [names],
    );
    if(result.rows.length!==names.length){
      throw new Error('protected table missing FORCE RLS');
    }
  });

  await check('canonical taxonomy has four nodes',async()=>{
    const slugs=[
      'sql.window_functions',
      'python.concurrency.rate_limiter',
      'distributed_systems.consensus.raft',
      'data_engineering.streaming',
    ];
    const result=await pool.query(
      `SELECT COUNT(*)::int AS count FROM capability_nodes WHERE slug=ANY($1::text[])`,
      [slugs],
    );
    if(result.rows[0].count!==4){
      throw new Error('canonical capability set incomplete');
    }
  });

  await check('conjunctive matching rejects incomplete proof',async()=>{
    const requiredSlugs=['sql.window_functions','distributed_systems.consensus.raft'];
    const candidateId='c9a01f42-8812-4211-b0e1-482910482910';
    const result=await pool.query(
      `WITH required AS (
         SELECT id
         FROM capability_nodes
         WHERE slug=ANY($1::text[])
       ), matched AS (
         SELECT ucs.user_id
         FROM user_capability_states ucs
         JOIN required r ON r.id=ucs.capability_node_id
         WHERE ucs.state='DEMONSTRATED'
         GROUP BY ucs.user_id
         HAVING COUNT(DISTINCT ucs.capability_node_id)=(SELECT COUNT(*) FROM required)
       )
       SELECT user_id
       FROM matched
       WHERE user_id=$2::uuid`,
      [requiredSlugs,candidateId],
    );
    if(result.rows.length){
      throw new Error('incomplete candidate matched');
    }
  });

  await check('active contact uniqueness index exists',async()=>{
    const result=await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname='uq_active_employer_candidate_role'`,
    );
    if(!result.rows.length){
      throw new Error('unique active contact index missing');
    }
  });

  await check('weekly contact quota trigger is serialized',async()=>{
    const result=await pool.query(
      `SELECT pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p
       WHERE p.proname='enforce_weekly_contact_quota'
       LIMIT 1`,
    );
    if(!result.rows[0]?.definition.includes('pg_advisory_xact_lock')){
      throw new Error('quota trigger lacks transaction advisory lock');
    }
  });

  await check('disclosure vocabulary is exactly four levels',async()=>{
    const result=await pool.query(
      `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       WHERE t.relname='evidence_access_events'
         AND c.contype='c'
         AND pg_get_constraintdef(c.oid) LIKE '%disclosure_level%'`,
    );
    if(!result.rows[0]){
      throw new Error('disclosure level constraint missing');
    }
    const definition=result.rows[0].definition;
    for(const level of ['LEVEL_1_SUMMARY','LEVEL_2_CONTEXT','LEVEL_3_CODE','LEVEL_4_INTEGRITY']){
      if(!definition.includes(level)){
        throw new Error(`disclosure level missing: ${level}`);
      }
    }
  });

  await check('RLS policies use safe nullable UUID context',async()=>{
    const names=[
      'candidate_employer_authorizations',
      'candidate_contact_intents',
      'evidence_access_events',
      'user_capability_states',
      'candidate_visibility_settings',
      'evidence_records',
    ];
    const result=await pool.query(
      `SELECT COUNT(DISTINCT tablename)::int AS count
       FROM pg_policies
       WHERE tablename=ANY($1::text[])
         AND (qual LIKE '%NULLIF(current_setting%'
              OR with_check LIKE '%NULLIF(current_setting%')`,
      [names],
    );
    if(result.rows[0].count<6){
      throw new Error('one or more protected tables lack hardened context policies');
    }
  });

  console.log(checks.join('\n'));
  if(checks.some((entry)=>entry.startsWith('FAIL '))){
    process.exitCode=1;
  }
}finally{
  await pool.end();
}
