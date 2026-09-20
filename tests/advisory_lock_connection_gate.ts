import assert from 'node:assert/strict';
import {directPool,withSessionClient} from '../lib/db';

const LOCK_KEY="patima-security-gate-advisory-lock";
const USER_ID='00000000-0000-0000-0000-000000000001';

async function run(){
  const a=await directPool.connect();
  const b=await directPool.connect();
  try{
    console.log('[GATE 1] Transaction advisory lock blocks a concurrent waiter and releases on rollback...');
    await a.query('BEGIN');
    await a.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[LOCK_KEY]);

    let acquired=false;
    const waiter=(async()=>{
      await b.query('BEGIN');
      await b.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[LOCK_KEY]);
      acquired=true;
      await b.query('COMMIT');
    })();

    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(acquired,false,'concurrent advisory lock waiter acquired too early');
    await a.query('ROLLBACK');
    await waiter;
    assert.equal(acquired,true,'advisory lock was not released by rollback');
    console.log('PASS: second transaction remained blocked until the first transaction rolled back.');

    console.log('[GATE 2] Advisory lock releases on commit...');
    await a.query('BEGIN');
    await a.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[LOCK_KEY]);
    const committedWaiter=(async()=>{
      await b.query('BEGIN');
      await b.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[LOCK_KEY]);
      await b.query('COMMIT');
    })();
    await new Promise(resolve=>setTimeout(resolve,150));
    await a.query('COMMIT');
    await committedWaiter;
    console.log('PASS: transaction advisory lock was released by commit.');

    console.log('[GATE 3] Connection is returned after callback failure...');
    await assert.rejects(
      withSessionClient(USER_ID,async()=>{throw new Error('EXPECTED_GATE_FAILURE');},{requiresAdvisoryLock:true}),
      /EXPECTED_GATE_FAILURE/,
    );
    const probe=await directPool.connect();
    try{
      const result=await probe.query('SELECT 1 AS ok');
      assert.equal(result.rows[0].ok,1);
    }finally{
      probe.release();
    }
    console.log('PASS: failed transactional callback did not leak a pooled connection.');

    console.log('[GATE 4] Connection is returned after successful callback...');
    const value=await withSessionClient(USER_ID,async client=>{
      const result=await client.query('SELECT 2 AS ok');
      return result.rows[0].ok;
    },{requiresAdvisoryLock:true});
    assert.equal(value,2);
    const probeAfterSuccess=await directPool.connect();
    try{
      const result=await probeAfterSuccess.query('SELECT 3 AS ok');
      assert.equal(result.rows[0].ok,3);
    }finally{
      probeAfterSuccess.release();
    }
    console.log('PASS: successful transactional callback returned its connection to the pool.');

    console.log('[GATE 5] Migration runner contains a transaction advisory lock and post-lock version recheck...');
    const {readFile}=await import('node:fs/promises');
    const migration=await readFile(new URL('../scripts/migrate.mjs',import.meta.url),'utf8');
    assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\('\s*patima:schema-migrations\s*'/);
    assert.match(migration,/SELECT 1 FROM schema_migrations WHERE version=\$1/);
    console.log('PASS: migration runner serializes concurrent migration execution and rechecks the ledger after acquiring the lock.');

    console.log('ALL 5 ADVISORY LOCK / CONNECTION LIFECYCLE GATES PASSED.');
  }finally{
    await a.release();
    await b.release();
  }
}

run().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
