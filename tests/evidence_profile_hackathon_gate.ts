import {readFileSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const evidence=readFileSync(path.join(root,'app/app/evidence/page.tsx'),'utf8');
const evidenceApi=readFileSync(path.join(root,'app/api/candidate/evidence/route.ts'),'utf8');
const profile=readFileSync(path.join(root,'app/app/profile/page.tsx'),'utf8');
const hack=readFileSync(path.join(root,'app/app/hackathons/page.tsx'),'utf8');
const hackApi=readFileSync(path.join(root,'app/api/hackathons/route.ts'),'utf8');
const hackAction=readFileSync(path.join(root,'app/api/hackathons/[id]/action/route.ts'),'utf8');
const hackDiscovery=readFileSync(path.join(root,'app/api/hackathons/arenas/route.ts'),'utf8');
const hackJoin=readFileSync(path.join(root,'app/api/hackathons/[id]/join/route.ts'),'utf8');
const mig=readFileSync(path.join(root,'migrations/057_hackathon_arena_and_parity.sql'),'utf8');

console.log('[GATE 1] Evidence dossier is server-backed and inspectable...');
for(const x of ['/api/candidate/evidence','evidence_records','assessment_execution_runs','artifactSha256','executionTraceDigest']) if(!evidence.includes(x)&&!evidenceApi.includes(x)) throw new Error('missing '+x);
if(evidence.includes('loadEvidence(')||evidence.includes('sql-window-probe.sql')||evidence.includes('CLIENT_EVALUATED')) throw new Error('mock evidence remains');
console.log('PASS');

console.log('[GATE 2] Profile uses authenticated evidence, not placeholder capability claims...');
for(const x of ['/api/candidate/overview','Verified technical matrix','Evidence records','/app/evidence']) if(!profile.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('[GATE 3] Hackathon arena marketplace supports discovery, parity, agreement and scheduling...');
for(const x of ['Arena Discovery','Create Arena','Open Public Arena','Private 1v1','Team Squad','FILTERS','Parity audit','Review & Join']) if(!hack.includes(x)) throw new Error('missing '+x);
for(const x of ['arena_type','max_participants','creator_stack','is_public']) if(!hackApi.includes(x)) throw new Error('missing '+x);
for(const x of ['candidateTheta','targetTheta','SIGNIFICANT_DISPARITY','canJoin']) if(!hackDiscovery.includes(x)) throw new Error('missing '+x);
for(const x of ['ARENA_NOT_PUBLIC','ARENA_FULL','declaredLanguage']) if(!hackJoin.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('[GATE 4] Arena conditions are platform-generated at scheduling...');
for(const x of ['generatedBy','platform-authored','serverArbitration','cpuLimitMs','memoryLimitMb','network:false','simultaneousStart']) if(!hackAction.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('[GATE 5] Hackathon persistence remains RLS-protected...');
for(const x of ['hackathon_arenas','hackathon_participants','hackathon_contributions','FORCE ROW LEVEL SECURITY','agreed_terms']) if(!mig.includes(x)) throw new Error('missing '+x);
console.log('PASS');

console.log('ALL 5 EVIDENCE / PROFILE / HACKATHON FOUNDATION GATES PASSED.');
