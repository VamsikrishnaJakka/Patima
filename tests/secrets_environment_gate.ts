import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
const sourceFiles=tracked.filter(file=>/^(app|lib|scripts)\//.test(file)&&/\.(ts|tsx|js|mjs|cjs)$/.test(file));
const clientFiles=sourceFiles.filter(file=>{const text=readFileSync(join(root,file),'utf8');return text.includes("'use client'")||text.includes('"use client"');});
const envExample=readFileSync(join(root,'.env.example'),'utf8');

console.log('[GATE 1] Local secret-bearing environment files are ignored and not tracked...');
assert.ok(existsSync(join(root,'.gitignore')));
const gitignore=readFileSync(join(root,'.gitignore'),'utf8');
for(const entry of ['.env','.env.local','.env.*.local']){assert.ok(gitignore.split(/\r?\n/).some(line=>line.trim()===entry),entry+' is not protected by .gitignore');}
assert.ok(!tracked.some(file=>file==='.env'||(/^\.env\..+\.local$/.test(file))), 'a secret-bearing .env file is tracked');
console.log('PASS: environment secret files are ignored and none are tracked.');

console.log('[GATE 2] Public environment namespace cannot expose server secrets...');
const publicSecret=/NEXT_PUBLIC_(?:DATABASE|DIRECT_URL|PG_|GEMINI_API_KEY|PATIMA_SEED_|.*PASSWORD|.*SECRET|.*TOKEN|.*PRIVATE_KEY)/i;
assert.doesNotMatch(envExample,publicSecret);
for(const file of sourceFiles){const text=readFileSync(join(root,file),'utf8');assert.doesNotMatch(text,publicSecret,'public secret environment variable reference in '+file);}
console.log('PASS: no server-secret environment variables are exposed through NEXT_PUBLIC_.');

console.log('[GATE 3] Client bundles cannot read server-only secret environment variables...');
const serverOnly=/process\.env\.(?:DATABASE_URL|DIRECT_URL|GEMINI_API_KEY|PATIMA_SEED_CANDIDATE_PASSWORD|PATIMA_SEED_EMPLOYER_PASSWORD|PG_[A-Z0-9_]+)/;
for(const file of clientFiles){const text=readFileSync(join(root,file),'utf8');assert.doesNotMatch(text,serverOnly,'server-only secret environment access in client file '+file);}
console.log('PASS: client components contain no server-only secret environment access.');

console.log('[GATE 4] Repository does not contain obvious hard-coded credential URLs...');
const credentialUrl=/postgres(?:ql)?:\/\/[^\s"'`;,)\]}]+/gi;
const realCredentialMarker=/(?:sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})/;
const allowedLocalDatabaseUrl='postgresql://postgres:postgres@localhost:5432/patima_dev';
function isNonSecretCredentialUrl(value:string){
  if(value===allowedLocalDatabaseUrl)return true;
  return /^postgres(?:ql)?:\/\/user:password@(?:example\.com|localhost)(?::\d+)?\//i.test(value);
}
const textualFiles=tracked.filter(file=>file!=='.env.example'&&!file.endsWith('.lock')&&!/\.(png|jpg|jpeg|gif|webp|ico|pdf|woff|woff2|ttf|eot|zip|gz|tar)$/i.test(file));
for(const file of textualFiles){const text=readFileSync(join(root,file),'utf8');const credentialUrls=(text.match(credentialUrl)||[]).map(value=>value.replace(/[;,.)\]}]+$/g,''));const unexpectedCredentials=credentialUrls.filter(value=>!isNonSecretCredentialUrl(value));assert.equal(unexpectedCredentials.length,0,'hard-coded non-local credential URL in '+file);assert.doesNotMatch(text,realCredentialMarker,'credential-like token in '+file);}
console.log('PASS: no obvious credential-bearing URLs or common token formats are committed.');

console.log('[GATE 5] Passwords, API keys, and connection strings are not logged...');
const sensitiveLog=/console\.(?:log|info|warn|error)\s*\([^\n]*(?:\$\{\s*(?:candidatePassword|employerPassword|apiKey|databaseUrl|connectionString|authorization|cookie|(?:access|refresh|session)?Token)\s*\}|process\.env\.(?:DATABASE_URL|DIRECT_URL|GEMINI_API_KEY|PATIMA_SEED_[A-Z0-9_]+)|\b(?:candidatePassword|employerPassword|apiKey|databaseUrl|connectionString)\b\s*[,)+])/i;
for(const file of sourceFiles){const text=readFileSync(join(root,file),'utf8');assert.doesNotMatch(text,sensitiveLog,'sensitive value may be logged in '+file);}
console.log('PASS: no obvious sensitive-value logging patterns are committed.');

console.log('[GATE 6] Environment example documents server-only handling...');
assert.match(envExample,/Never commit real credentials/i);
assert.match(envExample,/DATABASE_URL=/);
assert.match(envExample,/DIRECT_URL=/);
assert.match(envExample,/GEMINI_API_KEY=/);
console.log('PASS: environment contract explicitly documents secret handling.');

console.log('ALL 6 SECRETS / ENVIRONMENT SCRUBBING GATES PASSED.');