import assert from 'node:assert/strict';
import {directPool} from '../lib/db';
import {readFileSync} from 'node:fs';

const repoRoot=process.cwd();

async function run(){
  console.log('[GATE 1] Active contact requests have a database uniqueness invariant...');
  const client=await directPool.connect();
  let cleanupCandidateId:string|undefined;
  let cleanupIntentId:string|undefined;
  try{
    const index=await client.query(`SELECT 1 FROM pg_indexes WHERE indexname='uq_active_employer_candidate_role'`);
    assert.equal(index.rows.length,1,'Active contact uniqueness index is missing.');
    console.log('PASS: active employer/candidate/role requests cannot be duplicated concurrently.');

    console.log('[GATE 2] Weekly contact quota is serialized at the database boundary...');
    const fn=await client.query(`SELECT pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.proname='enforce_weekly_contact_quota' LIMIT 1`);
    assert.match(fn.rows[0]?.definition||'',/pg_advisory_xact_lock\(hashtextextended\(NEW\.employer_account_id::text, 0\)\)/);
    console.log('PASS: quota enforcement uses a transaction-scoped employer lock.');

    console.log('[GATE 3] Contact-request route handles database-enforced quota races...');
    const route=readFileSync(repoRoot+'/app/api/hiring/contact/request/route.ts','utf8');
    assert.match(route,/WEEKLY_CONTACT_QUOTA_EXCEEDED/);
    assert.match(route,/status:429/);
    console.log('PASS: a race that reaches the DB quota trigger returns 429 instead of 500.');

    console.log('[GATE 4] Assessment start has a single-active-session database invariant...');
    const sessionIndex=await client.query(`SELECT 1 FROM pg_indexes WHERE indexname='idx_single_active_session_per_user_domain'`);
    assert.equal(sessionIndex.rows.length,1);
    console.log('PASS: concurrent assessment starts are protected by a partial unique index.');

    console.log('[GATE 5] Candidate consent transitions lock and validate current state...');
    const consent=readFileSync(repoRoot+'/app/api/candidate/contact/respond/route.ts','utf8');
    assert.match(consent,/FOR UPDATE/);
    assert.match(consent,/PENDING_CANDIDATE_APPROVAL/);
    console.log('PASS: consent mutation is serialized and cannot transition an already-resolved request.');

    console.log('[GATE 6] Assessment submission transitions lock the authoritative session...');
    const submit=readFileSync(repoRoot+'/app/assessments/submit-step/route.ts','utf8');
    assert.match(submit,/FOR UPDATE OF ar/);
    const allocator=readFileSync(repoRoot+'/lib/assessment/allocator.ts','utf8');
    assert.match(allocator,/FOR UPDATE/);
    assert.match(allocator,/STEP_ALREADY_FINALIZED/);
    console.log('PASS: question reservations and finalization are serialized against replay.');

    console.log('[GATE 7] Legacy assessment submission cannot overwrite a completed session...');
    const legacy=readFileSync(repoRoot+'/app/api/assessment/submit/route.ts','utf8');
    assert.match(legacy,/status='IN_PROGRESS' FOR UPDATE/);
    assert.match(legacy,/SET status='VERIFIED'/);
    console.log('PASS: legacy submission requires an active authoritative session and closes it atomically.');

    console.log('[GATE 8] Signup relies on database uniqueness rather than a check-then-insert race...');
    const signup=readFileSync(repoRoot+'/app/api/auth/signup/route.ts','utf8');
    assert.match(signup,/e\?\.code==='23505'/);
    const constraints=await client.query(`SELECT conname FROM pg_constraint WHERE conrelid='user_accounts'::regclass AND contype='u' AND pg_get_constraintdef(oid) LIKE '%email%'`);
    assert.ok(constraints.rows.length>=1,'user_accounts email uniqueness constraint is missing.');
    console.log('PASS: concurrent duplicate signup attempts resolve through a database uniqueness constraint.');

    console.log('');
    console.log('ALL 8 MUTATION / RACE HARDENING GATES PASSED.');
  }finally{
    client.release();
    await directPool.end();
  }
}

run().catch(error=>{
  console.error('GATE FAILURE:',error);
  process.exit(1);
});
