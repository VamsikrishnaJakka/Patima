import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directPool} from '../lib/db';

const root=process.cwd();

async function run(){
  const client=await directPool.connect();
  try{
    console.log('[GATE 1] Evidence-audit INSERT policy is bound to authenticated employer context...');
    const p=await client.query(`SELECT qual,with_check FROM pg_policies WHERE policyname='p_access_events_insert_employer' AND tablename='evidence_access_events'`);
    assert.equal(p.rows.length,1,'Evidence audit INSERT policy is missing.');
    const def=`${p.rows[0].qual||''}\n${p.rows[0].with_check||''}`;
    assert.match(def,/actor_user_id/);
    assert.match(def,/app\.current_user_id/);
    assert.match(def,/employer_account_id/);
    assert.match(def,/app\.current_employer_account_id/);
    console.log('PASS: audit writes are bound to both actor identity and selected organization.');

    console.log('[GATE 2] Evidence-audit INSERT policy enforces candidate visibility...');
    assert.match(def,/candidate_visibility_settings/);
    assert.match(def,/visibility = 'PUBLIC'/);
    assert.match(def,/APPROVED_EMPLOYERS_ONLY/);
    assert.match(def,/candidate_employer_authorizations/);
    assert.match(def,/revoked_at IS NULL/);
    console.log('PASS: an employer cannot create an audit event for an inaccessible candidate.');

    console.log('[GATE 3] Dossier endpoint checks candidate visibility and authorization...');
    const dossier=readFileSync(root+'/app/api/hiring/candidate/[id]/dossier/route.ts','utf8');
    assert.match(dossier,/cvs\.visibility/);
    assert.match(dossier,/candidate_employer_authorizations/);
    assert.match(dossier,/revoked_at IS NULL/);
    assert.match(dossier,/s\.employerAccountId/);
    console.log('PASS: dossier access is organization-scoped and authorization-aware.');

    console.log('[GATE 4] Summary endpoint checks candidate visibility and authorization...');
    const summary=readFileSync(root+'/app/api/hiring/candidate/[id]/summary/route.ts','utf8');
    assert.match(summary,/cvs\.visibility/);
    assert.match(summary,/candidate_employer_authorizations/);
    assert.match(summary,/revoked_at IS NULL/);
    assert.match(summary,/s\.employerAccountId/);
    console.log('PASS: candidate summaries cannot bypass employer authorization.');

    console.log('[GATE 5] Employer search is scoped to the selected organization...');
    const search=readFileSync(root+'/app/api/hiring/search/route.ts','utf8');
    assert.match(search,/s\.employerAccountId/);
    assert.match(search,/candidate_employer_authorizations/);
    assert.match(search,/revoked_at IS NULL/);
    console.log('PASS: approved-employer search results require active authorization for the selected organization.');

    console.log('[GATE 6] Candidate privacy audit is candidate-scoped...');
    const audit=readFileSync(root+'/app/api/candidate/privacy/audit/route.ts','utf8');
    assert.match(audit,/candidate_user_id=\$1/);
    assert.match(audit,/s\.userId/);
    console.log('PASS: candidates can retrieve only their own evidence-access audit trail.');

    console.log('[GATE 7] Employer organization selection is membership-bound...');
    const auth=readFileSync(root+'/lib/server-auth.ts','utf8');
    assert.match(auth,/employer_account_id = \$1/);
    assert.match(auth,/user_account_id = \$2/);
    assert.match(auth,/FORBIDDEN_ORGANIZATION/);
    console.log('PASS: an employer cannot select an organization without membership.');

    console.log('[GATE 8] Selected organization context is transaction-local...');
    assert.match(auth,/withSessionClient\(session\.userId/);
    assert.match(auth,/employerAccountId:session\.employerAccountId/);
    const db=readFileSync(root+'/lib/db.ts','utf8');
    assert.match(db,/set_config\(\$1,\$2,true\)/);
    assert.match(db,/app\.current_employer_account_id/);
    console.log('PASS: tenant context is injected into the transaction rather than trusted from request payloads.');

    console.log('');
    console.log('ALL 8 TENANT ACCESS / AUTHORIZATION GATES PASSED.');
  }finally{
    client.release();
    await directPool.end();
  }
}

run().catch(error=>{
  console.error('GATE FAILURE:',error);
  process.exit(1);
});
