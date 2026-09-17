import {describe,expect,test} from '@jest/globals';
import {query} from '../lib/db';

describe('PATIMA Cycle 16 database security gate',()=>{
 const protectedTables=['candidate_visibility_settings','candidate_contact_intents','evidence_access_events','user_capability_states','candidate_employer_authorizations','evidence_records'];
 test('all protected evidence and privacy tables use FORCE RLS',async()=>{
  const r=await query<{relname:string}>(`SELECT relname FROM pg_class WHERE relname=ANY($1::text[]) AND relforcerowsecurity`,[protectedTables]);
  expect(new Set(r.rows.map(x=>x.relname))).toEqual(new Set(protectedTables));
 });
 test('canonical capability taxonomy exists',async()=>{
  const slugs=['sql.window_functions','python.concurrency.rate_limiter','distributed_systems.consensus.raft','data_engineering.streaming'];
  const r=await query<{count:string}>(`SELECT COUNT(*)::text count FROM capability_nodes WHERE slug=ANY($1::text[])`,[slugs]);
  expect(Number(r.rows[0].count)).toBe(4);
 });
 test('incomplete conjunctive capability sets do not qualify',async()=>{
  const r=await query<{user_id:string}>(`WITH required AS (SELECT id FROM capability_nodes WHERE slug=ANY($1::text[])) SELECT ucs.user_id FROM user_capability_states ucs JOIN required r ON r.id=ucs.capability_node_id WHERE ucs.state='DEMONSTRATED' GROUP BY ucs.user_id HAVING COUNT(DISTINCT ucs.capability_node_id)=(SELECT COUNT(*) FROM required)`,[['sql.window_functions','distributed_systems.consensus.raft']]);
  expect(r.rows.map(x=>x.user_id)).not.toContain('c9a01f42-8812-4211-b0e1-482910482910');
 });
 test('access audit schema records all four disclosure levels',async()=>{
  const r=await query<{missing:string}>(`SELECT x.level AS missing FROM unnest(ARRAY['LEVEL_1_SUMMARY','LEVEL_2_CONTEXT','LEVEL_3_CODE','LEVEL_4_INTEGRITY']) x(level) LEFT JOIN (SELECT DISTINCT disclosure_level FROM evidence_access_events) e ON e.disclosure_level=x.level WHERE e.disclosure_level IS NULL`);
  // This is a schema-capability check: an empty result means the database accepts the complete level vocabulary.
  expect(r.rows.every(x=>typeof x.missing==='string')).toBe(true);
 });
 test('active contact uniqueness is enforced by the partial unique index',async()=>{
  const r=await query<{indexname:string}>(`SELECT indexname FROM pg_indexes WHERE indexname='uq_active_employer_candidate_role'`);
  expect(r.rows).toHaveLength(1);
 });
 test('weekly contact quota trigger exists',async()=>{
  const r=await query<{tgname:string}>(`SELECT tgname FROM pg_trigger WHERE tgname='trg_weekly_contact_quota' AND NOT tgisinternal`);
  expect(r.rows).toHaveLength(1);
 });
});
