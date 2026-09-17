import {Pool, PoolClient} from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/patima_dev';
export const pool = new Pool({connectionString, max:20, idleTimeoutMillis:30000, connectionTimeoutMillis:2000});

export async function query<T=any>(text:string, params:any[]=[]){
  return pool.query<T>(text, params);
}

export async function withSessionClient<T>(userId:string, callback:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT set_config($1,$2,true)', ['app.current_user_id', userId]);
    const result=await callback(client);
    await client.query('COMMIT');
    return result;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release();}
}

export default pool;
