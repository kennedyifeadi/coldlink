import type { Router } from 'express';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
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
};

/** A database that answers every query with no rows, for tests that need no real data. */
export function stubDatabase(): Database {
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
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
