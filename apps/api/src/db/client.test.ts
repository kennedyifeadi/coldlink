import { once } from 'node:events';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { sql } from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '../test/helpers.js';
import { createDatabase, type Database } from './client.js';

const AUTHENTICATION_OK = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0]);
const READY_FOR_QUERY = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]);
const TERMINATE = 0x58;

interface FakeConnection {
  socket: Socket;
  queried: boolean;
}

/**
 * A Postgres server that lets any client start up, then never answers a query: the moment before
 * a pooler resets a connection.
 */
async function startUnresponsivePostgres() {
  const connections: FakeConnection[] = [];
  const server = createServer((socket) => {
    const connection: FakeConnection = { socket, queried: false };
    connections.push(connection);
    let startedUp = false;
    socket.on('data', (data) => {
      if (!startedUp) {
        startedUp = true;
        socket.write(Buffer.concat([AUTHENTICATION_OK, READY_FOR_QUERY]));
      } else if (data[0] === TERMINATE) {
        socket.end();
      } else {
        connection.queried = true;
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    connections,
    url: `postgresql://coldlink@127.0.0.1:${port}/coldlink?sslmode=disable`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

type FakePostgres = Awaited<ReturnType<typeof startUnresponsivePostgres>>;

describe('createDatabase', () => {
  let postgres: FakePostgres;
  let db: Database;
  let logs: ReturnType<typeof captureLogs>;

  const queryThenReset = async (index: number) => {
    const query = db.connection().execute((connection) => sql`select 1`.execute(connection));
    await vi.waitFor(() => expect(postgres.connections[index]?.queried).toBe(true));
    postgres.connections[index]!.socket.resetAndDestroy();
    return query;
  };

  const start = async () => {
    postgres = await startUnresponsivePostgres();
    logs = captureLogs();
    db = createDatabase({ databaseUrl: postgres.url, databaseSslRootCert: undefined }, logs.logger);
  };

  afterEach(async () => {
    await db.destroy();
    await postgres.close();
  });

  it('fails the query and logs when a connection in use is reset, instead of crashing', async () => {
    await start();

    await expect(queryThenReset(0)).rejects.toThrow('ECONNRESET');
    expect(logs.output()).toContain('Database connection failed');
  });

  it('logs an idle connection that is reset once, instead of crashing', async () => {
    await start();
    await db.connection().execute(async () => undefined);

    postgres.connections[0]!.socket.resetAndDestroy();

    await vi.waitFor(() => expect(logs.output()).toContain('Database connection failed'));
    expect(logs.output().match(/Database connection failed/g)).toHaveLength(1);
  });

  it('opens a new connection for the next query after one is reset', async () => {
    await start();
    await expect(queryThenReset(0)).rejects.toThrow('ECONNRESET');

    await expect(queryThenReset(1)).rejects.toThrow('ECONNRESET');
    expect(postgres.connections).toHaveLength(2);
  });
});
