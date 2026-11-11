import { readFileSync } from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Logger } from 'pino';
import type { Config } from '../config.js';
import { typeParsers } from './parsers.js';
import type { DB } from './schema.js';

export type Database = Kysely<DB>;

// Supabase's session pooler caps clients per project; this leaves room for migrations and psql.
const POOL_MAX = 10;
const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;

type DatabaseConfig = Pick<Config, 'databaseUrl' | 'databaseSslRootCert'>;

// sslmode is taken out of the URL and applied as the ssl option, because node-postgres would
// otherwise read sslmode=require as verify-full and fail on Supabase's own CA.
function connectionOptions(config: DatabaseConfig, logger: Logger): pg.PoolConfig {
  const url = new URL(config.databaseUrl);
  const sslMode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  // The config only allows sslmode=disable for a database on localhost.
  if (sslMode === 'disable') return { connectionString: url.toString(), ssl: false };
  if (config.databaseSslRootCert === undefined) {
    logger.warn(
      'DATABASE_SSL_ROOT_CERT is not set: the database connection is encrypted but the ' +
        "server's certificate is not verified",
    );
    return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
  }
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ca: readFileSync(config.databaseSslRootCert, 'utf8') },
  };
}

export function createDatabase(config: DatabaseConfig, logger: Logger): Database {
  const pool = new pg.Pool({
    ...connectionOptions(config, logger),
    max: POOL_MAX,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    types: typeParsers,
  });
  // A client emits 'error' when its connection drops, as when the pooler resets it. The pool only
  // listens while the client is idle, and an unheard 'error' crashes the process, so every client
  // gets a listener of its own for its whole life. Its query still rejects, and the pool discards
  // it on release.
  pool.on('connect', (client) => {
    client.on('error', (err) => {
      logger.error({ err }, 'Database connection failed');
    });
  });
  // For an idle client the pool re-emits the same error here, already logged by the client's own
  // listener; this listener only keeps that second emit from crashing the process.
  pool.on('error', () => undefined);
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
