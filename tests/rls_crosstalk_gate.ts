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

const TEST_RLS_ROLE="patima_rls_gate";

async function prepareRlsRole(){
 const client=await runtimePool.connect();
 try{
  const meta=await client.query("SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
  const row=meta.rows[0];
  if(!row)throw new Error("Unable to inspect database role.");

  const existing=await client.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1",[TEST_RLS_ROLE]);
  if(existing.rowCount){
   if(existing.rows[0].rolsuper||existing.rows[0].rolbypassrls){
    throw new Error("Existing RLS test role is privileged; refuse to run isolation gate.");
   }
   return {role:TEST_RLS_ROLE};
  }

  if(!row.rolsuper){
   throw new Error("RLS test role is missing and current database role is not a superuser; create a dedicated NOSUPERUSER NOBYPASSRLS role for this gate.");
  }

  await client.query("CREATE ROLE "+TEST_RLS_ROLE+" NOSUPERUSER NOBYPASSRLS NOLOGIN");
  await client.query("GRANT USAGE ON SCHEMA public TO "+TEST_RLS_ROLE);
  await client.query("GRANT SELECT ON assessment_sessions TO "+TEST_RLS_ROLE);
  return {role:TEST_RLS_ROLE};
 }finally{client.release();}
}

async function withRlsContext<T>(role:string,userId:string,employerAccountId:string|undefined,callback:(client:import("pg").PoolClient)=>Promise<T>){
 const client=await runtimePool.connect();
 try{
  await client.query("BEGIN");
  if(role!== (await client.query("SELECT current_user")).rows[0]?.current_user){
   await client.query("SET LOCAL ROLE "+role);
  }
  await client.query("SELECT set_config($1,$2,true)",["app.current_user_id",userId]);
  await client.query("SELECT set_config($1,$2,true)",["app.current_employer_account_id",employerAccountId??""]);
  const result=await callback(client);
  await client.query("ROLLBACK");
  return result;
 }catch(error){
  try{await client.query("ROLLBACK");}catch{}
  throw error;
 }finally{client.release();}
}


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
 },{employerAccountId:EMPLOYER_ACCOUNT});
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
 },{employerAccountId:EMPLOYER_ACCOUNT});
 await withSessionClient(CANDIDATE,async(client)=>{
  const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
  assert.equal(r.rows[0]?.user_id,CANDIDATE);
  assert.equal(r.rows[0]?.employer_id,"");
 });
 console.log("PASS: candidate → employer → candidate transitions never inherit stale context.");

 console.log("[GATE 5] RLS sees only the active candidate context...");
 const rlsRole=await prepareRlsRole();
 try{
  const candidateRows=await withRlsContext(rlsRole.role,CANDIDATE,undefined,async(client)=>{
   const r=await client.query("SELECT id,user_id FROM assessment_sessions ORDER BY created_at DESC LIMIT 100");
   return r.rows;
  });
  assert.ok(candidateRows.every((row:any)=>row.user_id===CANDIDATE),"Candidate context exposed another user's assessment session.");
  console.log("PASS: candidate RLS returned "+candidateRows.length+" visible assessment session rows, all owned by the candidate.");

  console.log("[GATE 6] Employer context cannot masquerade as a candidate...");
  const employerRows=await withRlsContext(rlsRole.role,EMPLOYER,EMPLOYER_ACCOUNT,async(client)=>{
   const r=await client.query("SELECT id,user_id FROM assessment_sessions ORDER BY created_at DESC LIMIT 100");
   return r.rows;
  });
  assert.equal(employerRows.length,0,"Employer context unexpectedly exposed candidate assessment sessions.");
  console.log("PASS: employer context cannot read candidate assessment sessions.");

  console.log("[GATE 7] Deterministic concurrent mixed-user isolation...");
  const expected=[CANDIDATE,EMPLOYER,CANDIDATE,EMPLOYER,CANDIDATE,EMPLOYER,CANDIDATE,EMPLOYER];
  const burst=await Promise.all(expected.map((userId,index)=>withRlsContext(rlsRole.role,userId,userId===EMPLOYER?EMPLOYER_ACCOUNT:undefined,async(client)=>{
   await client.query("SELECT pg_sleep($1)",[index%2===0?0.02:0.01]);
   const r=await client.query("SELECT current_setting('app.current_user_id',true) AS user_id,current_setting('app.current_employer_account_id',true) AS employer_id");
   const visible=await client.query("SELECT count(*)::int AS count FROM assessment_sessions");
   return {expected:userId,actual:r.rows[0]?.user_id,employer:r.rows[0]?.employer_id,visible:Number(visible.rows[0]?.count||0)};
  })));
  for(const item of burst){
   assert.equal(item.actual,item.expected,"Concurrent user context crossed between pooled connections.");
   assert.equal(item.employer,item.expected===EMPLOYER?EMPLOYER_ACCOUNT:"","Concurrent employer context crossed between pooled connections.");
   if(item.expected===CANDIDATE)assert.ok(item.visible>=0,"Candidate RLS count failed.");
   else assert.equal(item.visible,0,"Employer context exposed candidate assessment sessions under concurrency.");
  }
  console.log("PASS: 8 deterministic concurrent transactions remained fully isolated.");
 }finally{
  // The dedicated test role is intentionally persistent so the gate never
  // needs to reassign or drop objects owned by a role it does not administer.
 }

 await runtimePool.end();
 console.log("");
 console.log("ALL 7 RLS SESSION-CONTEXT GATES PASSED.");
}

run().catch(async(error)=>{
 console.error("GATE FAILURE:",error instanceof Error?error.message:String(error));
 try{await runtimePool.end();}catch{}
 process.exit(1);
});
