import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {loadEnvConfig} from '@next/env';
import pg from 'pg';

loadEnvConfig(process.cwd());
const {Pool}=pg;
const databaseUrl=process.env.DIRECT_URL||process.env.DATABASE_URL;
const migrationsDir=path.join(process.cwd(),'migrations');
if(!databaseUrl){console.error('[PATIMA] DIRECT_URL or DATABASE_URL is required for migrations.');process.exit(1);}
const pool=new Pool({connectionString:databaseUrl,max:1});
try{
 await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())');
 const applied=new Set((await pool.query('SELECT version FROM schema_migrations')).rows.map(r=>r.version));
 const files=(await readdir(migrationsDir)).filter(f=>/^\d+_.+\.sql$/.test(f)).sort();
 for(const file of files){
  const version=file.split('_',1)[0];
  if(applied.has(version)){console.log(`[PATIMA] skip ${file}`);continue;}
  const sql=await readFile(path.join(migrationsDir,file),'utf8');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended('patima:schema-migrations',0))");
   const stillPending=await client.query('SELECT 1 FROM schema_migrations WHERE version=$1 LIMIT 1',[version]);
   if(stillPending.rows.length){
    await client.query('COMMIT');
    console.log(`[PATIMA] skip ${file}`);
    continue;
   }
   try{await client.query(sql);}catch(error){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'UNKNOWN';const message=error instanceof Error?error.message:String(error);throw new Error(`Migration ${file} failed [${code}]: ${message}`);}
   await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
   await client.query('COMMIT');
   console.log(`[PATIMA] applied ${file}`);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
}catch(error){const message=error instanceof Error?error.message:String(error);console.error(`[PATIMA] Database migration failed: ${message}`);process.exitCode=1;}finally{await pool.end();}
