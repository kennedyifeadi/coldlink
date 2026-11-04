import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client.js';
import { captureLogs, testApp } from '../test/helpers.js';
import { integrationDatabaseUrl, noTestDatabase, useTestTransaction } from '../test/integration.js';
import { version } from '../version.js';

function brokenUrl(change: Partial<Pick<URL, 'port' | 'username' | 'password'>>): URL {
  return Object.assign(new URL(integrationDatabaseUrl ?? ''), change);
}

describe.skipIf(noTestDatabase)('GET /api/v1/health against Postgres', () => {
  const db = useTestTransaction();

  it('reports ok when the database answers', async () => {
    const { app } = testApp(undefined, db());
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', version, database: 'up' });
  });

  it.each([
    // Each case uses its own password: the test database's is "postgres", which the log's stack
    // paths contain anyway.
    ['nothing listens on the port', { port: '1', password: 'unused-pw-9c3d' }],
    ['the credentials are wrong', { username: 'no_such_role', password: 'wrong-pw-1f2e' }],
  ])('reports degraded, without leaking credentials, when %s', async (_case, change) => {
    const url = brokenUrl(change);
    const broken = createDatabase(
      { databaseUrl: url.toString(), databaseSslRootCert: undefined },
      captureLogs().logger,
    );
    try {
      const { app, logs } = testApp(undefined, broken);
      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'degraded', version, database: 'down' });
      expect(logs.output()).toContain('Database check failed');
      expect(logs.output()).not.toContain(url.password);
      expect(logs.output()).not.toContain(url.toString());
    } finally {
      await broken.destroy();
    }
  });
});
