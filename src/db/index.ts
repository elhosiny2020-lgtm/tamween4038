import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      port: Number(process.env.SQL_PORT || 5432),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2500,
    });

    global._postgresPool.on('error', (err: any) => {
      // Normal closure of idle connections by remote server, Cloud SQL scale-to-zero, or proxy
      if (
        err?.message?.includes('Connection terminated') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01' ||
        err?.code === 'EPIPE'
      ) {
        return;
      }
      console.warn('Postgres pool background client event:', err?.message || err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });
