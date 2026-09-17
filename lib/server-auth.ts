import {cookies} from 'next/headers';
import {createHash, randomBytes, scryptSync, timingSafeEqual} from 'crypto';
import {query, withSessionClient} from '@/lib/db';

const COOKIE = 'patima_session';
const SESSION_DAYS = 7;
export type ServerRole = 'candidate' | 'employer';
export type ServerSession = {id:string; userId:string; name:string; email:string; handle:string; role:ServerRole; employerAccountId:string|null};
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
const hashPassword=(password:string)=>{const salt=randomBytes(16).toString('hex'); return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;};
const verifyPassword=(password:string,encoded:string)=>{const p=encoded.split('$'); if(p.length!==3||p[0]!=='scrypt')return false; const a=Buffer.from(p[2],'hex'), b=scryptSync(password,p[1],64); return a.length===b.length&&timingSafeEqual(a,b);};

export async function createUser(name:string,email:string,password:string){
 const normalized=email.trim().toLowerCase();
 if(!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error('Invalid email address.');
 if(password.length<8) throw new Error('Password must be at least 8 characters.');
 const base=(name.trim()||'candidate').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,32)||'candidate';
 const handle=`${base}-${randomBytes(3).toString('hex')}`;
 const r=await query<any>(`INSERT INTO user_accounts(name,email,handle,role,password_hash,email_verified_at) VALUES($1,$2,$3,'candidate',$4,clock_timestamp()) RETURNING id,name,email,handle,role`,[name.trim()||'Candidate',normalized,handle,hashPassword(password)]);
 return r.rows[0];
}
export async function verifyCredentials(email:string,password:string){const r=await query<any>(`SELECT id,name,email,handle,role,password_hash FROM user_accounts WHERE lower(email)=lower($1) AND status='ACTIVE' LIMIT 1`,[email.trim()]); const u=r.rows[0]; if(!u?.password_hash||!verifyPassword(password,u.password_hash))return null; return {id:u.id,name:u.name,email:u.email,handle:u.handle,role:u.role as ServerRole};}
export async function establishSession(userId:string){const token=randomBytes(32).toString('base64url'); await query(`INSERT INTO app_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)`,[userId,hashToken(token),new Date(Date.now()+SESSION_DAYS*86400000)]); cookies().set(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:SESSION_DAYS*86400});}
export async function getServerSession():Promise<ServerSession|null>{const token=cookies().get(COOKIE)?.value;if(!token)return null;const r=await query<any>(`SELECT s.id session_id,u.id user_id,u.name,u.email,u.handle,u.role,em.employer_account_id FROM app_sessions s JOIN user_accounts u ON u.id=s.user_id LEFT JOIN employer_members em ON em.user_account_id=u.id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.status='ACTIVE' ORDER BY em.employer_account_id NULLS LAST LIMIT 1`,[hashToken(token)]);const x=r.rows[0];return x?{id:x.session_id,userId:x.user_id,name:x.name,email:x.email,handle:x.handle,role:x.role,employerAccountId:x.employer_account_id||null}:null;}
export async function requireEmployer(){const s=await getServerSession();if(!s||s.role!=='employer'||!s.employerAccountId)throw new Error('UNAUTHORIZED');return s;}
export async function requireCandidate(){const s=await getServerSession();if(!s||s.role!=='candidate')throw new Error('UNAUTHORIZED');return s;}
export async function destroySession(){const token=cookies().get(COOKIE)?.value;if(token)await query(`DELETE FROM app_sessions WHERE token_hash=$1`,[hashToken(token)]);cookies().set(COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});}
export async function withAuthenticatedClient<T>(callback:(session:ServerSession,client:import('pg').PoolClient)=>Promise<T>){const session=await getServerSession();if(!session)throw new Error('UNAUTHORIZED');return withSessionClient(session.userId,client=>callback(session,client));}
