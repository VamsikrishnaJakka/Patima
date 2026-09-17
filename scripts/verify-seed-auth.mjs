import process from 'node:process';
import {scryptSync,timingSafeEqual} from 'node:crypto';
import pg from 'pg';
const {Pool}=pg;

if(!process.env.DATABASE_URL){console.error('[PATIMA] DATABASE_URL is required for seed authentication verification.');process.exit(1);}
const candidatePassword=process.env.PATIMA_SEED_CANDIDATE_PASSWORD||'';
const employerPassword=process.env.PATIMA_SEED_EMPLOYER_PASSWORD||'';
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});

function verifyPassword(password,encoded){
 const parts=encoded?.split('$')||[];
 if(parts.length!==3||parts[0]!=='scrypt')return false;
 const expected=Buffer.from(parts[2],'hex');
 const actual=scryptSync(password,parts[1],64);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}

try{
 for(const [email,password] of [['candidate@patima.test',candidatePassword],['recruiter@patima.test',employerPassword]]){
  const result=await pool.query(`SELECT id,email,role,password_hash FROM user_accounts WHERE lower(email)=lower($1) AND status='ACTIVE'`,[email]);
  if(result.rows.length!==1)throw new Error(`expected exactly one active seeded account for ${email}, found ${result.rows.length}`);
  if(!verifyPassword(password,result.rows[0].password_hash))throw new Error(`seeded password verification failed for ${email}`);
 }
 console.log('[PATIMA] Seeded candidate and employer credentials verified against the login password format.');
}finally{await pool.end();}
