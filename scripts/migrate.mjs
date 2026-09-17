import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const {Pool}=pg;
const migrationsDir=path.join(process.cwd(),'migrations');
if(!process.env.DATABASE_URL){console.error('[PATIMA] DATABASE_URL is required for migrations.');process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
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
   try{
    await client.query(sql);
   }catch(error){
    const code=error && typeof error==='object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    const message=error instanceof Error?error.message:String(error);
    throw new Error(`Migration ${file} failed [${code}]: ${message}`);
   }
   await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
   await client.query('COMMIT');
   console.log(`[PATIMA] applied ${file}`);
  }catch(error){
   await client.query('ROLLBACK');
   throw error;
  }finally{client.release();}
 }
}catch(error){
 const message=error instanceof Error?error.message:String(error);
 console.error(`[PATIMA] Database migration failed: ${message}`);
 process.exitCode=1;
}finally{await pool.end();}
