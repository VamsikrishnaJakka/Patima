import {readFileSync} from 'fs';
import {join} from 'path';
import assert from 'assert';

const root=process.cwd();
const migration=readFileSync(join(root,'migrations/060_public_evidence_shares.sql'),'utf8');
const shareApi=readFileSync(join(root,'app/api/candidate/evidence/share/route.ts'),'utf8');
const publicApi=readFileSync(join(root,'app/api/evidence/inspect/[id]/route.ts'),'utf8');
const publicPage=readFileSync(join(root,'app/evidence/inspect/[id]/page.tsx'),'utf8');
const evidencePage=readFileSync(join(root,'app/app/evidence/page.tsx'),'utf8');

console.log('[GATE 1] Public share storage is tokenized and candidate-scoped...');
assert.match(migration,/CREATE TABLE IF NOT EXISTS public_evidence_shares/);
assert.match(migration,/token TEXT PRIMARY KEY/);
assert.match(migration,/candidate_user_id UUID NOT NULL REFERENCES user_accounts/);
assert.match(migration,/revoked_at TIMESTAMPTZ/);
console.log('PASS');

console.log('[GATE 2] Public inspection cannot bypass candidate visibility...');
assert.match(migration,/trg_sync_public_evidence_shares_visibility/);
assert.match(migration,/NEW\.visibility = 'PUBLIC'/);
assert.match(migration,/SET revoked_at = clock_timestamp\(\)/);
assert.match(publicApi,/revoked_at IS NULL/);
assert.match(publicApi,/app\.public_share_token/);
console.log('PASS');

console.log('[GATE 3] Share creation requires authenticated candidate and PUBLIC visibility...');
assert.match(shareApi,/requireCandidate\(\)/);
assert.match(shareApi,/visibility!=='PUBLIC'/);
assert.match(shareApi,/gen_random_bytes\(24\)/);
assert.match(shareApi,/er\.user_id=\$2/);
console.log('PASS');

console.log('[GATE 4] Public disclosure levels are bounded...');
assert.match(publicApi,/LEVEL_1_SUMMARY/);
assert.match(publicApi,/LEVEL_2_CONTEXT/);
assert.match(publicApi,/LEVEL_3_CODE/);
assert.doesNotMatch(publicApi,/LEVEL_4_INTEGRITY/);
assert.match(publicApi,/if\(level==='LEVEL_3_CODE'\)/);
console.log('PASS');

console.log('[GATE 5] Candidate evidence UI creates and surfaces inspection links...');
assert.match(evidencePage,/api\/candidate\/evidence\/share/);
assert.match(evidencePage,/Create \/ copy link/);
assert.match(publicPage,/PUBLIC EVIDENCE/);
assert.match(publicPage,/Technical proof/);
console.log('PASS');

console.log('PUBLIC EVIDENCE INSPECTION GATE: 5/5 PASS');
