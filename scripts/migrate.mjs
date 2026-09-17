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
 for(const file of files){const version=file.split('_',1)[0];if(applied.has(version)){console.log(`[PATIMA] skip ${file}`);continue;}const sql=await readFile(path.join(migrationsDir,file),'utf8');const client=await pool.connect();try{await client.query('BEGIN');await client.query(sql);await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);await client.query('COMMIT');console.log(`[PATIMA] applied ${file}`);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
}finally{await pool.end();}
