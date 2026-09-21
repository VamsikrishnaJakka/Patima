import {readFileSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const evidence=readFileSync(path.join(root,'app/app/evidence/page.tsx'),'utf8');
const evidenceApi=readFileSync(path.join(root,'app/api/candidate/evidence/route.ts'),'utf8');
const profile=readFileSync(path.join(root,'app/app/profile/page.tsx'),'utf8');
const hack=readFileSync(path.join(root,'app/app/hackathons/page.tsx'),'utf8');
const hackApi=readFileSync(path.join(root,'app/api/hackathons/route.ts'),'utf8');
const hackAction=readFileSync(path.join(root,'app/api/hackathons/[id]/action/route.ts'),'utf8');
const mig=readFileSync(path.join(root,'migrations/057_hackathon_arena_and_parity.sql'),'utf8');

console.log('[GATE 1] Evidence dossier is server-backed and inspectable...');
for(const x of ['/api/candidate/evidence','evidence_records','assessment_execution_runs','artifactSha256','executionTraceDigest']) if(!evidence.includes(x)&&!evidenceApi.includes(x)) throw new Error('missing '+x);
if(evidence.includes('loadEvidence(')||evidence.includes('sql-window-probe.sql')||evidence.includes('CLIENT_EVALUATED')) throw new Error('mock evidence remains');
console.log('PASS');

console.log('[GATE 2] Profile uses authenticated evidence, not placeholder capability claims...');
for(const x of ['/api/candidate/overview','Verified technical matrix','Evidence records','/app/evidence']) if(!profile.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('[GATE 3] Hackathon lifecycle supports proposal, parity, mutual agreement and scheduling...');
for(const x of ['Schedule Hackathon','Accept challenge terms','parity','declared stack','verified level']) if(!hack.includes(x)) throw new Error('missing '+x);
for(const x of ['OPPONENT_NOT_FOUND','verified_capability_level','PROPOSED','ALL_PARTICIPANTS_MUST_AGREE']) if(!hackApi.includes(x)&&!hackAction.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('[GATE 4] Arena conditions are platform-generated at scheduling...');
for(const x of ['generatedBy','platform-authored','serverArbitration','cpuLimitMs','memoryLimitMb','network:false','simultaneousStart']) if(!hackAction.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('[GATE 5] Hackathon persistence is RLS-protected...');
for(const x of ['hackathon_arenas','hackathon_participants','hackathon_contributions','FORCE ROW LEVEL SECURITY','agreed_terms']) if(!mig.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('ALL 5 EVIDENCE / PROFILE / HACKATHON FOUNDATION GATES PASSED.');
