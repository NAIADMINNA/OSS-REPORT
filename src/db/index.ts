import fs from 'fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function resolveSqlHost(): string | undefined {
  const rawHost = process.env.SQL_HOST;
  if (!rawHost) return undefined;
  if (rawHost.startsWith('/app/cloudsql/') && !fs.existsSync(rawHost)) {
    const cloudRunSocket = rawHost.replace(/^\/app\/cloudsql\//, '/cloudsql/');
    if (fs.existsSync(cloudRunSocket)) {
      return cloudRunSocket;
    }
  }
  return rawHost;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: resolveSqlHost(),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 20000,
      keepAlive: true,
      allowExitOnIdle: true,
    });

    // When Cloud SQL recycles an idle socket or scales to zero, pg.Pool automatically
    // removes the disconnected idle client and opens a new connection on the next query.
    global._postgresPool.on('error', () => {
      // Handled automatically by pg.Pool reconnect on next checkout
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
