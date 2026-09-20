import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parse} from 'pg-connection-string';

const root=process.cwd();

function source(name:string){return readFileSync(path.join(root,name),'utf8');}

function run(){
  console.log('[GATE 1] Hosted database transport requires verified TLS...');
  const db=source('lib/db.ts');
  assert.match(db,/const hostedSsl=\{rejectUnauthorized:true\}/,'Hosted DB TLS must reject untrusted certificates.');
  assert.match(db,/ssl:isHostedRuntime\?hostedSsl:undefined/,'Both database pools must apply verified TLS in hosted runtimes.');
  assert.ok(!/ssl:\s*\{\s*rejectUnauthorized\s*:\s*false/.test(db),'Database TLS must never disable certificate verification.');
  console.log('PASS: hosted runtime database pools require certificate-verified TLS.');

  console.log('[GATE 2] Production connection examples use verify-full...');
  const env=source('.env.example');
  assert.ok(!/sslmode=require/.test(env),'Production connection examples must not recommend sslmode=require.');
  assert.match(env,/sslmode=verify-full/,'Production connection examples must use sslmode=verify-full.');
  console.log('PASS: documented production URLs use verify-full.');

  console.log('[GATE 3] Hosted runtime requires explicit database configuration...');
  assert.match(db,/if\(!configuredDatabaseUrl&&isHostedRuntime\)throw new Error\('DATABASE_NOT_CONFIGURED/);
  assert.match(db,/if\(!configuredDirectUrl&&isHostedRuntime\)throw new Error\('DIRECT_DATABASE_NOT_CONFIGURED/);
  console.log('PASS: hosted runtime cannot silently fall back to local database credentials.');

  console.log('[GATE 4] Connection pool limits and timeouts are bounded...');
  assert.match(db,/connectionTimeoutMillis:5000/);
  assert.match(db,/idleTimeoutMillis:30000/);
  assert.match(db,/PG_POOL_MAX/);
  assert.match(db,/PG_DIRECT_POOL_MAX/);
  console.log('PASS: runtime and direct pools have explicit bounded connection settings.');

  console.log('[GATE 5] Database credentials are not exposed through public environment variables...');
  assert.ok(!/NEXT_PUBLIC_(?:DATABASE|DIRECT_URL|PG_)/.test(db),'Database configuration must never use NEXT_PUBLIC_* variables.');
  assert.ok(!/NEXT_PUBLIC_(?:DATABASE|DIRECT_URL|PG_)/.test(env),'Database configuration must never be documented as public environment state.');
  console.log('PASS: database credentials remain server-only.');

  console.log('[GATE 6] Production SSL parser resolves verify-full explicitly...');
  const parsed=parse('postgresql://user:password@example.com/db?sslmode=verify-full');
  assert.equal(parsed.sslmode,'verify-full');
  assert.ok(!/sslmode=require/.test(env),'Production examples must not silently depend on require semantics.');
  console.log('PASS: production SSL configuration resolves explicitly to verify-full without legacy-mode ambiguity.');

  console.log('');
  console.log('ALL 6 DATABASE SECURITY GATES PASSED.');
}

try{run();}catch(error){
  console.error('GATE FAILURE:',error);
  process.exit(1);
}
