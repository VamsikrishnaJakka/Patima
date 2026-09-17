import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runtimePool,withSessionClient} from '../lib/db';

function loadLocalEnv(){
 try{
  const text=readFileSync(path.join(process.cwd(),'.env.local'),'utf8');
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();const i=line.indexOf('=');if(i<1)continue;
   const key=line.slice(0,i).trim();if(process.env[key])continue;
   let value=line.slice(i+1).trim();if(value.startsWith('"')&&value.endsWith('"'))value=value.slice(1,-1);process.env[key]=value;
  }
 }catch{}
}
loadLocalEnv();

const users=['c9a01f42-8812-4211-b0e1-482910482910','b0000000-0000-0000-0000-000000000002','c9a01f42-8812-4211-b0e1-482910482910'];
let failed=false;

async function run(){
 if(!process.env.DATABASE_URL){throw new Error('DATABASE_URL is required for the RLS cross-talk gate.');}
 console.log('================================================================');
 console.log('PATIMA RESILIENCE GATE: RLS SOCKET CONTAMINATION & CONCURRENCY');
 console.log('================================================================');

 console.log('[TEST 1] Interleaved sequential pool execution...');
 for(let i=0;i<users.length;i++){
  const expected=users[i];
  await withSessionClient(expected,async(client)=>{
   const result=await client.query(`SELECT current_setting('app.current_user_id',true) AS user_id`);
   if(result.rows[0]?.user_id!==expected){console.error(`FAIL: expected ${expected}, got ${result.rows[0]?.user_id}`);failed=true;}
  });
 }
 if(!failed)console.log('PASS: zero tenant leakage across sequential iterations.');

 console.log('[TEST 2] Aborted transaction cleanup...');
 try{await withSessionClient(users[0],async()=>{throw new Error('SIMULATED_TRANSACTION_CRASH');});}catch{}
 const cleanClient=await runtimePool.connect();
 try{
  const result=await cleanClient.query(`SELECT current_setting('app.current_user_id',true) AS user_id`);
  if(result.rows[0]?.user_id){console.error(`FAIL: residual tenant context ${result.rows[0].user_id}`);failed=true;}
  else console.log('PASS: rollback leaves the pooled socket without tenant context.');
 }finally{cleanClient.release();}

 console.log('[TEST 3] High-concurrency mixed-user burst (15 requests)...');
 const burst=await Promise.all(Array.from({length:15},(_,index)=>{
  const expected=users[index%users.length];
  return withSessionClient(expected,async(client)=>{
   await new Promise(resolve=>setTimeout(resolve,Math.random()*20));
   const result=await client.query(`SELECT current_setting('app.current_user_id',true) AS user_id`);
   return {expected,actual:result.rows[0]?.user_id};
  });
 }));
 const mismatches=burst.filter(item=>item.expected!==item.actual);
 if(mismatches.length){console.error(`FAIL: ${mismatches.length} tenant context mismatches.`);failed=true;}else console.log('PASS: all 15 concurrent executions remained isolated.');

 await runtimePool.end();
 if(failed){console.error('GATE RESULT: FAILED');process.exit(1);}
 console.log('GATE RESULT: PASSED (RLS pool isolation verified)');
}
run().catch(async(error)=>{console.error(`Fatal gate error: ${error instanceof Error?error.message:String(error)}`);try{await runtimePool.end();}catch{}process.exit(1);});
