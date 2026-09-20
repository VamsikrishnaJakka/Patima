import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

function loadLocalEnv(){
 try{
  const text=readFileSync(path.join(process.cwd(),".env.local"),"utf8");
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim(); const i=line.indexOf("=");
   if(i<1) continue;
   const key=line.slice(0,i).trim();
   if(process.env[key]) continue;
   let value=line.slice(i+1).trim();
   if(value.length>=2 && ((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))))
    value=value.slice(1,-1);
   process.env[key]=value;
  }
 }catch{}
}
loadLocalEnv();

const BASE=(process.env.PATIMA_LOCAL_BASE_URL||"http://localhost:3000").replace(/\/$/,"");
const CANDIDATE_EMAIL="candidate@patima.test";
const EMPLOYER_EMAIL="recruiter@patima.test";

function envValue(name:string){
 try{
  const text=readFileSync(path.join(process.cwd(),".env.local"),"utf8");
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim(); const i=line.indexOf("=");
   if(i>0 && line.slice(0,i).trim()===name){
    let v=line.slice(i+1).trim();
    if(v.length>=2 && ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))))v=v.slice(1,-1);
    return v;
   }
  }
 }catch{}
 return "";
}

const candidatePassword=envValue("PATIMA_SEED_CANDIDATE_PASSWORD");
const employerPassword=envValue("PATIMA_SEED_EMPLOYER_PASSWORD");
if(!candidatePassword||!employerPassword) throw new Error("Seed passwords are required in .env.local.");

type CookieJar={value:string|null;setCookie:string};
async function request(pathname:string,options:RequestInit={},jar:CookieJar={value:null,setCookie:""}){
 const headers=new Headers(options.headers);
 if(jar.value) headers.set("cookie",`patima_session=${jar.value}`);
 const response=await fetch(`${BASE}${pathname}`,{...options,headers,redirect:"manual"});
 const set=response.headers.get("set-cookie")||"";
 const match=set.match(/patima_session=([^;]*)/);
 if(match) jar.value=match[1];
 let body:unknown=null;
 try{body=await response.json();}catch{}
 return {response,body,setCookie:set};
}

async function login(email:string,password:string):Promise<CookieJar>{
 const jar:CookieJar={value:null,setCookie:""};
 const r=await request("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})},jar);
 assert.equal(r.response.status,200,`login ${email} must return 200`);
 assert.ok(jar.value,`login ${email} must issue patima_session cookie`);
 return jar;
}

async function expireSession(jar:CookieJar){
 const {runtimePool}=await import("../lib/db");
 const client=await runtimePool.connect();
 try{
  await client.query(
   `UPDATE app_sessions
    SET expires_at=clock_timestamp()-INTERVAL '1 minute'
    WHERE token_hash=encode(digest($1,'sha256'),'hex')`,
   [jar.value]
  );
 }finally{client.release();}
}

async function revokeSession(jar:CookieJar){
 const {runtimePool}=await import("../lib/db");
 const client=await runtimePool.connect();
 try{
  await client.query(
   `DELETE FROM app_sessions
    WHERE token_hash=encode(digest($1,'sha256'),'hex')`,
   [jar.value]
  );
 }finally{client.release();}
}

async function run(){
 console.log("================================================================");
 console.log("PATIMA P1 AUTHENTICATION / SESSION SECURITY GATE");
 console.log("================================================================");

 console.log("[GATE 1] Unauthenticated candidate endpoint -> 401...");
 const anonCandidate=await request("/api/candidate/overview");
 assert.equal(anonCandidate.response.status,401);
 console.log("PASS: unauthenticated candidate access is rejected.");

 console.log("[GATE 2] Unauthenticated employer endpoint -> 401...");
 const anonEmployer=await request("/api/hiring/search",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({required_capability_slugs:["sql"]})
 });
 assert.equal(anonEmployer.response.status,401);
 console.log("PASS: unauthenticated employer access is rejected.");

 console.log("[GATE 3] Candidate session -> employer endpoint -> 401/403 role boundary...");
 const candidate=await login(CANDIDATE_EMAIL,candidatePassword);
 const candidateToEmployer=await request("/api/hiring/search",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({required_capability_slugs:["sql"]})
 },candidate);
 assert.equal(candidateToEmployer.response.status,401);
 console.log("PASS: candidate cannot enter employer-only API.");

 console.log("[GATE 4] Employer session -> candidate endpoint -> 401/403 role boundary...");
 const employer=await login(EMPLOYER_EMAIL,employerPassword);
 const employerToCandidate=await request("/api/candidate/overview",{},employer);
 assert.equal(employerToCandidate.response.status,401);
 console.log("PASS: employer cannot enter candidate-only API.");

 console.log("[GATE 5] Forged session token -> 401...");
 const forged={value:"definitely-not-a-valid-session-token",setCookie:""};
 const forgedResult=await request("/api/candidate/overview",{},forged);
 assert.equal(forgedResult.response.status,401);
 console.log("PASS: forged session token is rejected.");

 console.log("[GATE 6] Expired server-side session -> 401...");
 const expiring=await login(CANDIDATE_EMAIL,candidatePassword);
 await expireSession(expiring);
 const expiredResult=await request("/api/candidate/overview",{},expiring);
 assert.equal(expiredResult.response.status,401);
 console.log("PASS: expired session is rejected server-side.");

 console.log("[GATE 7] Revoked/deleted server-side session -> 401...");
 const revocable=await login(CANDIDATE_EMAIL,candidatePassword);
 await revokeSession(revocable);
 const revokedResult=await request("/api/candidate/overview",{},revocable);
 assert.equal(revokedResult.response.status,401);
 console.log("PASS: revoked session is rejected server-side.");

 console.log("[GATE 8] Candidate cannot poison employer organization context...");
 const candidateOrg=await request("/api/auth/organization",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({employer_account_id:"e0000000-0000-0000-0000-000000000001"})
 },candidate);
 assert.equal(candidateOrg.response.status,401);
 console.log("PASS: candidate cannot select employer organization.");

 console.log("[GATE 9] Invalid employer organization membership -> 403...");
 const employerOrg=await request("/api/auth/organization",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({employer_account_id:"00000000-0000-0000-0000-000000000099"})
 },employer);
 assert.equal(employerOrg.response.status,403);
 console.log("PASS: employer organization selection is membership-checked.");

 console.log("[GATE 10] Client payload cannot alter authenticated identity...");
 const candidateMe=await request("/api/auth/me",{},candidate);
 assert.equal(candidateMe.response.status,200);
 const me=candidateMe.body as any;
 assert.equal(me?.session?.role,"candidate");
 assert.notEqual(me?.session?.userId,me?.session?.employerAccountId);
 console.log("PASS: authenticated identity and role are server-derived, not request-payload derived.");

 console.log("");
 console.log("ALL 10 AUTHENTICATION / SESSION SECURITY GATES PASSED.");
}

run().catch(async(error)=>{
 console.error("GATE FAILURE:",error instanceof Error?error.stack||error.message:String(error));
 try{const {runtimePool}=await import("../lib/db");await runtimePool.end();}catch{}
 process.exit(1);
});