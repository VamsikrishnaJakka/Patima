import {cookies} from 'next/headers';
import {createHash, randomBytes, scryptSync, timingSafeEqual} from 'crypto';
import {query, withSessionClient} from '@/lib/db';

const COOKIE='patima_session';
const SESSION_DAYS=7;

export type ServerRole='candidate'|'employer';
export type ServerSession={id:string;userId:string;name:string;email:string;handle:string;role:ServerRole;employerAccountId:string|null};

function hashToken(token:string){return createHash('sha256').update(token).digest('hex');}

function hashPassword(password:string){
  const salt=randomBytes(16).toString('hex');
  const derived=scryptSync(password,salt,64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password:string,encoded:string){
  const parts=encoded.split('$');
  if(parts.length!==3||parts[0]!=='scrypt')return false;
  const actual=Buffer.from(parts[2],'hex');
  const expected=scryptSync(password,parts[1],64);
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}

export async function createUser(name:string,email:string,password:string,role:ServerRole='candidate'){
  const normalized=email.trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(normalized))throw new Error('Invalid email address.');
  if(password.length<8)throw new Error('Password must be at least 8 characters.');
  const base=(name.trim()||'candidate').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,32)||'candidate';
  const handle=`${base}-${randomBytes(3).toString('hex')}`;
  const result=await query<{id:string;name:string;email:string;handle:string;role:ServerRole}>(
    `INSERT INTO user_accounts(name,email,handle,role,password_hash,email_verified_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()) RETURNING id,name,email,handle,role`,
    [name.trim()||'Candidate',normalized,handle,role,hashPassword(password)]
  );
  return result.rows[0];
}

export async function verifyCredentials(email:string,password:string){
  const result=await query<any>(`SELECT id,name,email,handle,role,password_hash FROM user_accounts WHERE lower(email)=lower($1) LIMIT 1`,[email.trim()]);
  const user=result.rows[0];
  if(!user?.password_hash || !verifyPassword(password,user.password_hash))return null;
  return {id:user.id,name:user.name,email:user.email,handle:user.handle,role:user.role as ServerRole};
}

export async function establishSession(userId:string){
  const token=randomBytes(32).toString('base64url');
  const expires=new Date(Date.now()+SESSION_DAYS*86400000);
  await query(`INSERT INTO app_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)`,[userId,hashToken(token),expires]);
  cookies().set(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:SESSION_DAYS*86400});
}

export async function getServerSession():Promise<ServerSession|null>{
  const token=cookies().get(COOKIE)?.value;
  if(!token)return null;
  const result=await query<any>(
    `SELECT s.id session_id,u.id user_id,u.name,u.email,u.handle,u.role,em.employer_account_id
     FROM app_sessions s JOIN user_accounts u ON u.id=s.user_id
     LEFT JOIN employer_members em ON em.user_account_id=u.id
     WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()
     ORDER BY em.employer_account_id NULLS LAST LIMIT 1`,[hashToken(token)]
  );
  const r=result.rows[0];
  if(!r)return null;
  return {id:r.session_id,userId:r.user_id,name:r.name,email:r.email,handle:r.handle,role:r.role,employerAccountId:r.employer_account_id||null};
}

export async function requireRole(role:ServerRole){
  const session=await getServerSession();
  if(!session||session.role!==role)throw new Error('UNAUTHORIZED');
  return session;
}

export async function destroySession(){
  const token=cookies().get(COOKIE)?.value;
  if(token)await query(`DELETE FROM app_sessions WHERE token_hash=$1`,[hashToken(token)]);
  cookies().set(COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});
}

export async function withAuthenticatedClient<T>(callback:(session:ServerSession,client:import('pg').PoolClient)=>Promise<T>){
  const session=await getServerSession();
  if(!session)throw new Error('UNAUTHORIZED');
  return withSessionClient(session.userId,client=>callback(session,client));
}
