import {cookies} from 'next/headers';
import {createHash, randomBytes, scryptSync, timingSafeEqual} from 'crypto';
import {query, withSessionClient} from '@/lib/db';

const COOKIE = 'patima_session';
const ORG_COOKIE = 'patima_employer_org';
const SESSION_DAYS = 7;
export type ServerRole = 'candidate' | 'employer';
export type EmployerMembership = {employerAccountId:string; organizationName:string; role:string};
export type ServerSession = {id:string; userId:string; name:string; email:string; handle:string; role:ServerRole; employerAccountId:string|null; employerMemberships:EmployerMembership[]};
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
export async function getServerSession():Promise<ServerSession|null>{
 const token=cookies().get(COOKIE)?.value;if(!token)return null;
 const orgId=cookies().get(ORG_COOKIE)?.value||null;
 const r=await query<any>(`SELECT s.id session_id,u.id user_id,u.name,u.email,u.handle,u.role FROM app_sessions s JOIN user_accounts u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.status='ACTIVE'`,[hashToken(token)]);
 const x=r.rows[0];if(!x)return null;
 const memberships=await query<any>(`SELECT em.employer_account_id,ea.organization_name,em.role FROM employer_members em JOIN employer_accounts ea ON ea.id=em.employer_account_id WHERE em.user_account_id=$1 ORDER BY ea.organization_name`,[x.user_id]);
 if(x.role!=='employer')return {id:x.session_id,userId:x.user_id,name:x.name,email:x.email,handle:x.handle,role:x.role,employerAccountId:null,employerMemberships:[]};
 if(!memberships.rows.length)return null;
 const selected=orgId?memberships.rows.find((m:any)=>m.employer_account_id===orgId):memberships.rows.length===1?memberships.rows[0]:null;
 return {id:x.session_id,userId:x.user_id,name:x.name,email:x.email,handle:x.handle,role:x.role,employerAccountId:selected?.employer_account_id||null,employerMemberships:memberships.rows.map((m:any)=>({employerAccountId:m.employer_account_id,organizationName:m.organization_name,role:m.role}))};
}
export async function selectEmployerOrganization(employerAccountId:string){
 const s=await getServerSession();if(!s||s.role!=='employer')throw new Error('UNAUTHORIZED');
 const member=await query<any>(`SELECT 1 FROM employer_members WHERE employer_account_id=$1 AND user_account_id=$2`,[employerAccountId,s.userId]);
 if(!member.rows.length)throw new Error('FORBIDDEN_ORGANIZATION');
 cookies().set(ORG_COOKIE,employerAccountId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:SESSION_DAYS*86400});
}
export async function requireEmployer(){const s=await getServerSession();if(!s||s.role!=='employer')throw new Error('UNAUTHORIZED');if(!s.employerAccountId)throw new Error('ORGANIZATION_CONTEXT_REQUIRED');return s;}
export async function requireCandidate(){const s=await getServerSession();if(!s||s.role!=='candidate')throw new Error('UNAUTHORIZED');return s;}
export async function destroySession(){const token=cookies().get(COOKIE)?.value;if(token)await query(`DELETE FROM app_sessions WHERE token_hash=$1`,[hashToken(token)]);cookies().set(COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});cookies().set(ORG_COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});}
export async function withAuthenticatedClient<T>(callback:(session:ServerSession,client:import('pg').PoolClient)=>Promise<T>){const session=await getServerSession();if(!session)throw new Error('UNAUTHORIZED');if(session.role==='employer'&&!session.employerAccountId)throw new Error('ORGANIZATION_CONTEXT_REQUIRED');return withSessionClient(session.userId,client=>callback(session,client),session.employerAccountId);}
