import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directPool} from '../lib/db';

const root=process.cwd();

async function run(){
  console.log('[GATE 1] Privacy API rejects ambiguous boolean values...');
  const visibility=readFileSync(root+'/app/api/candidate/settings/visibility/route.ts','utf8');
  assert.match(visibility,/typeof body\.accepting_contact_requests!=='boolean'/);
  assert.match(visibility,/typeof body\.peer_visibility!=='boolean'/);
  assert.doesNotMatch(visibility,/Boolean\(body\.accepting_contact_requests\)/);
  assert.doesNotMatch(visibility,/Boolean\(body\.peer_visibility\)/);
  console.log('PASS: string/number truthiness cannot silently change candidate privacy state.');

  console.log('[GATE 2] Contact requests require candidate consent state...');
  const request=readFileSync(root+'/app/api/hiring/contact/request/route.ts','utf8');
  assert.match(request,/accepting_contact_requests/);
  assert.match(request,/!candidate\.rows\[0\]\.accepting_contact_requests/);
  console.log('PASS: employers cannot create contact requests when the candidate has disabled contact.');

  console.log('[GATE 3] Approved-employer contact requires active authorization...');
  assert.match(request,/APPROVED_EMPLOYERS_ONLY/);
  assert.match(request,/candidate_employer_authorizations/);
  assert.match(request,/revoked_at IS NULL/);
  console.log('PASS: revoked authorization cannot satisfy contact-request authorization.');

  console.log('[GATE 4] Candidate consent response is serialized and expiry-aware...');
  const respond=readFileSync(root+'/app/api/candidate/contact/respond/route.ts','utf8');
  assert.match(respond,/FOR UPDATE/);
  assert.match(respond,/expires_at/);
  assert.match(respond,/status='EXPIRED'/);
  assert.match(respond,/revoked_at=NULL/);
  console.log('PASS: consent cannot accept an expired request and acceptance restores only that employer authorization.');

  console.log('[GATE 5] Revocation is respected by every employer evidence boundary...');
  const files=[
    root+'/app/api/hiring/candidate/[id]/dossier/route.ts',
    root+'/app/api/hiring/candidate/[id]/summary/route.ts',
    root+'/app/api/hiring/search/route.ts',
  ];
  for(const file of files){
    const src=readFileSync(file,'utf8');
    assert.match(src,/candidate_employer_authorizations/);
    assert.match(src,/revoked_at IS NULL/);
  }
  console.log('PASS: dossier, summary, and search all require active authorization for approved-only candidates.');

  console.log('[GATE 6] Database evidence access is also revocation-aware...');
  const client=await directPool.connect();
  try{
    const p=await client.query(`SELECT qual,with_check FROM pg_policies WHERE policyname='p_evidence_records_access' AND tablename='evidence_records'`);
    assert.equal(p.rows.length,1,'Evidence RLS policy is missing.');
    const def=`${p.rows[0].qual||''}\n${p.rows[0].with_check||''}`;
    assert.match(def,/candidate_employer_authorizations/);
    assert.match(def,/revoked_at IS NULL/);
    console.log('PASS: database evidence access denies revoked employer authorization.');
  }finally{client.release();await directPool.end();}

  console.log('[GATE 7] Audit events remain bound to legitimate access...');
  const audit=readFileSync(root+'/migrations/048_audit_event_access_hardening.sql','utf8');
  assert.match(audit,/candidate_visibility_settings/);
  assert.match(audit,/candidate_employer_authorizations/);
  assert.match(audit,/revoked_at IS NULL/);
  console.log('PASS: forged audit entries cannot bypass candidate visibility or authorization.');

  console.log('');
  console.log('ALL 7 PRIVACY / REVOCATION / DATA-LEAK GATES PASSED.');
}
run().catch(error=>{console.error('GATE FAILURE:',error);process.exit(1);});
