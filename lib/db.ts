import {Pool, PoolClient, QueryResultRow} from 'pg';
import nextEnv from '@next/env';

const {loadEnvConfig} = nextEnv;
loadEnvConfig(process.cwd());

const isHostedRuntime=process.env.VERCEL==='1'||process.env.NODE_ENV==='production';
const configuredDatabaseUrl=process.env.DATABASE_URL?.trim();
const configuredDirectUrl=process.env.DIRECT_URL?.trim();
const localDatabaseUrl='postgresql://postgres:postgres@localhost:5432/patima_dev';

function assertDatabaseConfigured(){
 if(!configuredDatabaseUrl&&isHostedRuntime)throw new Error('DATABASE_NOT_CONFIGURED: DATABASE_URL is required for the hosted runtime.');
}
function assertDirectDatabaseConfigured(){
 if(!configuredDirectUrl&&isHostedRuntime)throw new Error('DIRECT_DATABASE_NOT_CONFIGURED: DIRECT_URL is required for direct administrative or advisory-lock operations.');
}

const runtimeConnectionString=configuredDatabaseUrl||localDatabaseUrl;
const directConnectionString=configuredDirectUrl||configuredDatabaseUrl||localDatabaseUrl;
const hostedSsl={rejectUnauthorized:true};

export const runtimePool=new Pool({connectionString:runtimeConnectionString,ssl:isHostedRuntime?hostedSsl:undefined,max:Number(process.env.PG_POOL_MAX||(process.env.VERCEL?5:10)),idleTimeoutMillis:30000,connectionTimeoutMillis:5000,maxUses:0});
export const directPool=new Pool({connectionString:directConnectionString,ssl:isHostedRuntime?hostedSsl:undefined,max:Number(process.env.PG_DIRECT_POOL_MAX||3),idleTimeoutMillis:10000,connectionTimeoutMillis:5000,maxUses:0});
export const pool=runtimePool;

export async function query<T extends QueryResultRow=QueryResultRow>(text:string,params:unknown[]=[]){assertDatabaseConfigured();return runtimePool.query<T>(text,params);}

type SessionOptions={requiresAdvisoryLock?:boolean;employerAccountId?:string|null};
export async function withSessionClient<T>(userId:string,callback:(client:PoolClient)=>Promise<T>,employerAccountIdOrOptions?:string|null|SessionOptions):Promise<T>{
 if(!userId)throw new Error('INVALID_SESSION_CONTEXT');
 const options:SessionOptions=typeof employerAccountIdOrOptions==='object'&&employerAccountIdOrOptions!==null?employerAccountIdOrOptions:{employerAccountId:employerAccountIdOrOptions};
 const targetPool=options.requiresAdvisoryLock?directPool:runtimePool;
 if(options.requiresAdvisoryLock)assertDirectDatabaseConfigured();else assertDatabaseConfigured();
 const client=await targetPool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT set_config($1,$2,true)',['app.current_user_id',userId]);
  await client.query('SELECT set_config($1,$2,true)',['app.current_employer_account_id',options.employerAccountId??'']);
  const result=await callback(client);
  await client.query('COMMIT');
  return result;
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export default pool;
