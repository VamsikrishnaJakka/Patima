import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {runtimePool,withSessionClient} from "../lib/db";

function loadLocalEnv(){
 try{
  const text=readFileSync(path.join(process.cwd(),".env.local"),"utf8");
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();const i=line.indexOf("=");if(i<1)continue;
   const key=line.slice(0,i).trim();if(process.env[key])continue;
   let value=line.slice(i+1).trim();if(value.startsWith('"')&&value.endsWith('"'))value=value.slice(1,-1);
   process.env[key]=value;
  }
 }catch{}
}
loadLocalEnv();

const CANDIDATE="c9a01f42-8812-4211-b0e1-482910482910";
const EMPLOYER="b0000000-0000-0000-0000-000000000002";
const EMPLOYER_ACCOUNT="e0000000-0000-0000-0000-000000000001";

async function run(){
 if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required for the RLS cross-talk gate.");

 console.log("================================================================");
 console.log("PATIMA RESILIENCE GATE: RLS SESSION-CONTEXT ISOLATION");
 console.log("================================================================");

 console.log("[GATE 1] Transaction-local user context...");
 await withSessionClient(CANDIDATE,async(client)=>{
  const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
  assert.equal(r.rows[0]?.user_id,CANDIDATE);
  assert.equal(r.rows[0]?.employer_id,"");
 });
 console.log("PASS: candidate context is set only inside its transaction.");

 console.log("[GATE 2] Transaction-local employer context...");
 await withSessionClient(EMPLOYER,async(client)=>{
  const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
  assert.equal(r.rows[0]?.user_id,EMPLOYER);
  assert.equal(r.rows[0]?.employer_id,EMPLOYER_ACCOUNT);
 });
 console.log("PASS: employer user and organization context are both transaction-scoped.");

 console.log("[GATE 3] Rollback clears both context values...");
 try{await withSessionClient(CANDIDATE,async()=>{throw new Error("SIMULATED_TRANSACTION_CRASH");});}catch{}
 const clean=await runtimePool.connect();
 try{
  const r=await clean.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
  assert.equal(r.rows[0]?.user_id,"");
  assert.equal(r.rows[0]?.employer_id,"");
 }finally{clean.release();}
 console.log("PASS: failed transactions cannot leave identity or organization context on a pooled connection.");

 console.log("[GATE 4] Context switches cannot inherit prior identity...");
 await withSessionClient(CANDIDATE,async(client)=>{
  const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id");
  assert.equal(r.rows[0]?.user_id,CANDIDATE);
 });
 await withSessionClient(EMPLOYER,async(client)=>{
  const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
  assert.equal(r.rows[0]?.user_id,EMPLOYER);
  assert.equal(r.rows[0]?.employer_id,EMPLOYER_ACCOUNT);
 });
 await withSessionClient(CANDIDATE,async(client)=>{
  const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
  assert.equal(r.rows[0]?.user_id,CANDIDATE);
  assert.equal(r.rows[0]?.employer_id,"");
 });
 console.log("PASS: candidate → employer → candidate transitions never inherit stale context.");

 console.log("[GATE 5] RLS sees only the active candidate context...");
 const candidateRows=await withSessionClient(CANDIDATE,async(client)=>{
  const r=await client.query("SELECT id,user_id FROM assessment_sessions ORDER BY created_at DESC LIMIT 100");
  return r.rows;
 });
 assert.ok(candidateRows.every((row:any)=>row.user_id===CANDIDATE),"Candidate context exposed another user's assessment session.");
 console.log("PASS: candidate RLS returned "+candidateRows.length+" visible assessment session rows, all owned by the candidate.");

 console.log("[GATE 6] Employer context cannot masquerade as a candidate...");
 await withSessionClient(EMPLOYER,async(client)=>{
  const r=await client.query("SELECT id,user_id FROM assessment_sessions ORDER BY created_at DESC LIMIT 100");
  assert.equal(r.rows.length,0,"Employer context unexpectedly exposed candidate assessment sessions.");
 });
 console.log("PASS: employer context cannot read candidate assessment sessions.");

 console.log("[GATE 7] Deterministic concurrent mixed-user isolation...");
 const expected=[CANDIDATE,EMPLOYER,CANDIDATE,EMPLOYER,CANDIDATE,EMPLOYER,CANDIDATE,EMPLOYER];
 const burst=await Promise.all(expected.map((userId,index)=>withSessionClient(userId,async(client)=>{
  await client.query("SELECT pg_sleep($1)",[index%2===0?0.02:0.01]);
  const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
  return {expected:userId,actual:r.rows[0]?.user_id,employer:r.rows[0]?.employer_id};
 })));
 for(const item of burst){
  assert.equal(item.actual,item.expected,"Concurrent user context crossed between pooled connections.");
  assert.equal(item.employer,item.expected===EMPLOYER?EMPLOYER_ACCOUNT:"","Concurrent employer context crossed between pooled connections.");
 }
 console.log("PASS: 8 deterministic concurrent transactions remained fully isolated.");

 await runtimePool.end();
 console.log("");
 console.log("ALL 7 RLS SESSION-CONTEXT GATES PASSED.");
}

run().catch(async(error)=>{
 console.error("GATE FAILURE:",error instanceof Error?error.message:String(error));
 try{await runtimePool.end();}catch{}
 process.exit(1);
});
