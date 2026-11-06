import type { Router } from 'express';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SelectQueryNode,
  TableNode,
  type CompiledQuery,
  type DatabaseConnection,
  type QueryResult,
} from 'kysely';
import { createApp } from '../app.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { createLogger } from '../logger.js';

export const ALLOWED_ORIGIN = 'https://app.coldlink.test';

export const testConfig: Config = {
  nodeEnv: 'test',
  port: 0,
  logLevel: 'silent',
  corsOrigins: [ALLOWED_ORIGIN],
  // Unit tests never connect: they get stubDatabase() unless a test builds its own.
  databaseUrl: 'postgresql://coldlink:unused@127.0.0.1:1/coldlink?sslmode=disable',
  databaseSslRootCert: undefined,
  sms: { provider: 'console' },
  auth: {
    jwtSecret: 'test-jwt-secret-0123456789abcdefghijklmnop',
    otpPepper: 'test-otp-pepper-0123456789abcdefghijklmnop',
    cookieSameSite: 'strict',
    devOtp: false,
  },
  trustProxyHops: 0,
};

export type StubRows = Partial<Record<keyof DB, object[]>>;

function selectedTable({ query }: CompiledQuery): string | undefined {
  if (!SelectQueryNode.is(query)) return undefined;
  const from = query.from?.froms[0];
  return from !== undefined && TableNode.is(from) ? from.table.identifier.name : undefined;
}

// Answers a select with the rows given for the table it selects from, whatever its columns, joins
// or filters.
class StubDriver extends DummyDriver {
  constructor(private readonly rows: Record<string, object[] | undefined>) {
    super();
  }

  override acquireConnection(): Promise<DatabaseConnection> {
    return Promise.resolve({
      executeQuery: <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
        const table = selectedTable(query);
        const rows = table === undefined ? [] : (this.rows[table] ?? []);
        return Promise.resolve({ rows: rows as R[] });
      },
      streamQuery: () => {
        throw new Error('The stub database does not stream');
      },
    });
  }
}

/**
 * A database that answers each select with the rows given for its table, and every other query with
 * no rows, for tests that need no real database.
 */
export function stubDatabase(rows: StubRows = {}): Database {
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new StubDriver(rows),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

export function captureLogs() {
  const lines: string[] = [];
  const logger = createLogger('info', {
    write: (line: string) => {
      lines.push(line);
    },
  });
  return { logger, lines, output: () => lines.join('') };
}

export function testApp(routes?: Router, db: Database = stubDatabase()) {
  const logs = captureLogs();
  const app = createApp(
    testConfig,
    routes === undefined ? { db, logger: logs.logger } : { db, logger: logs.logger, routes },
  );
  return { app, logs };
}
