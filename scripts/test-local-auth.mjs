import {readFileSync} from 'node:fs';
import process from 'node:process';

const envPath=new URL('../.env.local',import.meta.url);
let envText='';
try{envText=readFileSync(envPath,'utf8');}catch{console.error('[PATIMA] .env.local is required for local auth verification.');process.exit(1);}

function envValue(text,name){
  for(const rawLine of text.split(/\r?\n/)){
    const line=rawLine.trim();
    const separator=line.indexOf('=');
    if(separator<0||line.slice(0,separator).trim()!==name)continue;
    let value=line.slice(separator+1).trim();
    if(value.length>=2&&((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))))value=value.slice(1,-1);
    return value;
  }
  return '';
}

const baseUrl=(process.env.PATIMA_LOCAL_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
const candidatePassword=envValue(envText,'PATIMA_SEED_CANDIDATE_PASSWORD');
const employerPassword=envValue(envText,'PATIMA_SEED_EMPLOYER_PASSWORD');
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
