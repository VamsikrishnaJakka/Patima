import {Pool, PoolClient, QueryResultRow} from 'pg';

const isHostedRuntime = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
const localDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/patima_dev';

function assertDatabaseConfigured() {
  if (!configuredDatabaseUrl && isHostedRuntime) {
    throw new Error('DATABASE_NOT_CONFIGURED: DATABASE_URL is required for the hosted runtime.');
  }
}

const connectionString = configuredDatabaseUrl || localDatabaseUrl;

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 5 : 10)),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxUses: 0,
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: any[] = []) {
  assertDatabaseConfigured();
  return pool.query<T>(text, params);
}

export async function withSessionClient<T>(userId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!userId) throw new Error('INVALID_SESSION_CONTEXT');
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
