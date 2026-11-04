import { sql } from 'kysely';
import type { Logger } from 'pino';
import type { Database } from './client.js';

export type DatabaseStatus = 'up' | 'down';

const CHECK_TIMEOUT_MS = 2_000;

/** Runs a trivial query, reporting `down` on any error or after the timeout rather than throwing. */
export async function checkDatabase(
  db: Database,
  logger: Logger,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<DatabaseStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Database check timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([sql`select 1`.execute(db), timeout]);
    return 'up';
  } catch (err) {
    logger.warn({ err }, 'Database check failed');
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
