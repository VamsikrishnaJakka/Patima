import {readFileSync} from 'node:fs';
import process from 'node:process';

const envPath=new URL('../.env.local',import.meta.url);
let envText='';
try{envText=readFileSync(envPath,'utf8');}catch{console.error('[PATIMA] .env.local is required for local auth verification.');process.exit(1);}

function envValue(name){
  const pattern=new RegExp(`^\\s*${name}\\s*=\\s*[\"']?([^\"'\\r\\n]+)[\"']?\\s*$`,'m');
  return envText.match(pattern)?.[1]?.trim()||'';
}

const baseUrl=(process.env.PATIMA_LOCAL_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
const candidatePassword=envValue('PATIMA_SEED_CANDIDATE_PASSWORD');
const employerPassword=envValue('PATIMA_SEED_EMPLOYER_PASSWORD');
if(!candidatePassword||!employerPassword){console.error('[PATIMA] Seed passwords are missing from .env.local. Run npm run setup:local first.');process.exit(1);}

async function check(email,password,expectedRole){
  const response=await fetch(`${baseUrl}/api/auth/login`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({email,password}),
  });
  let body={};
  try{body=await response.json();}catch{}
  if(!response.ok||body?.user?.role!==expectedRole){
    const detail=body?.error||`HTTP ${response.status}`;
    throw new Error(`${email}: login failed (${detail}).`);
  }
  console.log(`[PATIMA] PASS live login for ${email} (${expectedRole}).`);
}

try{
  await check('candidate@patima.test',candidatePassword,'candidate');
  await check('recruiter@patima.test',employerPassword,'employer');
  console.log('[PATIMA] Live local authentication flow is using the seeded credentials.');
}catch(error){
  console.error(`[PATIMA] Live local authentication check failed: ${error instanceof Error?error.message:String(error)}`);
  console.error(`[PATIMA] Confirm the Next.js server is running at ${baseUrl} and was restarted after the latest local setup.`);
  process.exitCode=1;
}
