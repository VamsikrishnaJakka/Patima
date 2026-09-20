import assert from 'node:assert/strict';
import {directPool} from '../lib/db';
import {dispatchAuthenticVerification} from '../lib/verification/dispatcher';

type VariantRow={
  id:string;
  domain:string;
  family_code:string;
  concept_tag:string;
  experience_level:string;
  variant_code:string;
  question_type:string;
  is_active:boolean;
  scenario_entity:string;
  fixture_ddl:string;
  public_tests:unknown;
  hidden_tests:unknown;
};

const EXPECTED_DOMAINS=[
  'sql-window-functions',
  'python-concurrency',
  'java.concurrency_memory',
  'linux.process_signals',
  'docker.container_internals',
  'sql',
];
const EXPECTED_LEVELS=['BEGINNER','INTERMEDIATE','ADVANCED'];
const PRIMARY_ASSESSMENT_DOMAINS=new Set(EXPECTED_DOMAINS.filter(domain=>domain!=='sql'));

function asTests(value:unknown):any[]{
  return Array.isArray(value)?value:[];
}

async function run(){
  const client=await directPool.connect();
  try{
    console.log('[GATE 1] Assessment configuration coverage...');
    const configs=await client.query(`
      SELECT domain,experience_level,total_questions,duration_minutes,
             min_difficulty,max_difficulty,starting_difficulty
      FROM assessment_level_configs
      ORDER BY domain,experience_level
    `);
    assert.equal(configs.rows.length,18,'Unexpected assessment configuration count.');
    for(const row of configs.rows){
      assert.ok(EXPECTED_DOMAINS.includes(row.domain),`Unexpected assessment domain: ${row.domain}`);
      assert.ok(EXPECTED_LEVELS.includes(row.experience_level),`Unexpected level: ${row.experience_level}`);
      assert.ok(Number(row.total_questions)>0,`Invalid question count for ${row.domain}/${row.experience_level}`);
      assert.ok(Number(row.duration_minutes)>0,`Invalid duration for ${row.domain}/${row.experience_level}`);
      assert.ok(Number(row.min_difficulty)<Number(row.max_difficulty),`Invalid difficulty band for ${row.domain}/${row.experience_level}`);
      assert.ok(Number(row.starting_difficulty)>=Number(row.min_difficulty)&&Number(row.starting_difficulty)<=Number(row.max_difficulty),`Starting difficulty outside band for ${row.domain}/${row.experience_level}`);
    }
    console.log(`PASS: ${configs.rows.length} assessment configurations are valid.`);

    console.log('[GATE 2] Question-family and variant inventory coverage...');
    const familyCounts=await client.query(`
      SELECT f.domain,f.concept_tag,COUNT(*)::int AS family_count
      FROM question_families f
      GROUP BY f.domain,f.concept_tag
      ORDER BY f.domain,f.concept_tag
    `);
    assert.equal(familyCounts.rows.length,EXPECTED_DOMAINS.length*20,'Expected 20 authored inventory families per domain.');
    for(const row of familyCounts.rows)assert.equal(Number(row.family_count),1,`Duplicate concept/family inventory detected for ${row.domain}/${row.concept_tag}`);
    const variants=await client.query(`
      SELECT v.id,f.domain,f.family_code,f.concept_tag,v.experience_level,
             v.variant_code,v.question_type,v.is_active,v.scenario_entity,
             v.fixture_ddl,v.public_tests,v.hidden_tests
      FROM question_variants v
      JOIN question_families f ON f.id=v.family_id
      ORDER BY f.domain,v.experience_level,f.family_code,v.variant_code
    `);
    assert.equal(variants.rows.length,EXPECTED_DOMAINS.length*EXPECTED_LEVELS.length*20*3,'Expected exactly 3 variants per family/level.');
    for(const row of variants.rows){
      assert.ok(EXPECTED_DOMAINS.includes(row.domain),`Unexpected variant domain: ${row.domain}`);
      assert.ok(EXPECTED_LEVELS.includes(row.experience_level),`Unexpected variant level: ${row.experience_level}`);
      assert.match(row.variant_code,/^VAR_[ABC]$/,`Invalid variant code ${row.variant_code}`);
      assert.ok(row.is_active,`Inactive inventory variant is present in executable assessment inventory: ${row.domain}/${row.experience_level}/${row.family_code}/${row.variant_code}`);
      assert.ok(row.prompt_markdown===undefined || typeof row.prompt_markdown==='string');
      assert.ok(typeof row.fixture_ddl==='string'&&row.fixture_ddl.trim().length>0,`Missing fixture DDL: ${row.id}`);
    }
    console.log(`PASS: ${variants.rows.length} active variants cover all configured assessments.`);

    console.log('[GATE 3] Executability boundary...');
    const executable=variants.rows.filter((r:VariantRow)=>r.question_type==='CODING');
    assert.equal(executable.length,30,'Only the 30 explicitly authored SQL intermediate variants should be executable.');
    for(const row of variants.rows){
      const testsPublic=asTests(row.public_tests);
      const testsHidden=asTests(row.hidden_tests);
      if(row.domain==='sql-window-functions'&&row.experience_level==='INTERMEDIATE'&&/^SQL_INTERMEDIATE_F(0[1-9]|10)$/.test(row.family_code)){
        assert.equal(row.question_type,'CODING',`Authored SQL variant is not CODING: ${row.family_code}/${row.variant_code}`);
        assert.ok(testsPublic.length>=1,`Missing public suite: ${row.family_code}/${row.variant_code}`);
        assert.ok(testsHidden.length>=1,`Missing hidden suite: ${row.family_code}/${row.variant_code}`);
        assert.equal(row.scenario_entity,'customer_orders',`Unexpected SQL scenario entity: ${row.family_code}/${row.variant_code}`);
      }else{
        assert.equal(row.question_type,'THEORY',`Non-authored variant became executable: ${row.domain}/${row.experience_level}/${row.family_code}/${row.variant_code}`);
        assert.equal(testsPublic.length,0,`Non-executable variant has public executable tests: ${row.domain}/${row.experience_level}/${row.family_code}/${row.variant_code}`);
        assert.equal(testsHidden.length,0,`Non-executable variant has hidden executable tests: ${row.domain}/${row.experience_level}/${row.family_code}/${row.variant_code}`);
      }
    }
    console.log('PASS: executable boundary is explicit; all other variants remain THEORY.');

    console.log('[GATE 4] Every authored SQL suite executes against its own canonical contract...');
    let checked=0;
    for(const row of executable as VariantRow[]){
      const pub=asTests(row.public_tests);
      const hid=asTests(row.hidden_tests);
      const all=[...pub,...hid];
      assert.ok(all.length>=2,`Authored suite is too small: ${row.family_code}/${row.variant_code}`);
      for(const test of all){
        assert.equal(typeof test.name,'string',`Test name missing: ${row.family_code}/${row.variant_code}`);
        assert.equal(typeof test.fixture_ddl,'string',`Fixture missing: ${row.family_code}/${row.variant_code}/${test.name}`);
        assert.equal(typeof test.canonical_sql,'string',`Canonical SQL missing: ${row.family_code}/${row.variant_code}/${test.name}`);
        assert.ok(test.canonical_sql.trim().length>0,`Empty canonical SQL: ${row.family_code}/${row.variant_code}/${test.name}`);
      }
      const candidate=String(pub[0].canonical_sql);
      const report=await dispatchAuthenticVerification({domain:row.domain,candidateCode:candidate,variant:row});
      checked++;
      if(report.verdict!=='ACCEPTED'||!report.allPassed){
        const failures=report.testCases.filter((t:any)=>t.status!=='AC').map((t:any)=>({id:t.id,name:t.name,status:t.status,error:t.errorMessage}));
        throw new Error(`AUTHORED_SUITE_FAILURE ${row.family_code}/${row.variant_code}: ${JSON.stringify(failures)}`);
      }
      assert.equal(report.publicTestsPassed,report.publicTestsTotal,`Public suite mismatch: ${row.family_code}/${row.variant_code}`);
      assert.equal(report.hiddenTestsPassed,report.hiddenTestsTotal,`Hidden suite mismatch: ${row.family_code}/${row.variant_code}`);
    }
    console.log(`PASS: ${checked} executable variants passed their complete public+hidden authored suites.`);

    console.log('[GATE 5] Authored test contracts are internally complete...');
    for(const row of executable as VariantRow[]){
      const pub=asTests(row.public_tests);
      const hid=asTests(row.hidden_tests);
      const authoritative=JSON.stringify({
        fixture:pub[0].fixture_ddl,
        sql:pub[0].canonical_sql,
        order_sensitive:pub[0].order_sensitive??true,
      });
      for(const test of [...pub,...hid]){
        const contract=JSON.stringify({
          fixture:test.fixture_ddl,
          sql:test.canonical_sql,
          order_sensitive:test.order_sensitive??true,
        });
        assert.equal(contract,authoritative,`Authored test contract drift: ${row.family_code}/${row.variant_code}/${test.name}`);
      }
    }
    console.log('PASS: every authored test uses the authoritative strict contract.');

    console.log('');
    console.log('ALL 5 ALL-ASSESSMENTS INTEGRITY GATES PASSED.');
  }finally{
    client.release();
    await directPool.end();
  }
}

run().catch(error=>{
  console.error('GATE FAILURE:',error);
  process.exit(1);
});
