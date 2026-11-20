import type { Server } from 'node:http';
import type { Logger } from 'pino';
import type { BackgroundTasks } from './backgroundTasks.js';
import type { Database } from './db/client.js';
import type { Scheduler } from './jobs/scheduler.js';

export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDependencies {
  server: Pick<Server, 'close' | 'closeIdleConnections'>;
  scheduler: Pick<Scheduler, 'stop'>;
  tasks: Pick<BackgroundTasks, 'drain'>;
  db: Pick<Database, 'destroy'>;
  logger: Logger;
  exit: (code: number) => void;
  timeoutMs?: number;
}

/**
 * Stops taking requests and starting job runs, then waits for the requests, the job runs and the
 * background tasks in flight before closing the pool they all write to.
 */
export function createShutdown({
  server,
  scheduler,
  tasks,
  db,
  logger,
  exit,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
}: ShutdownDependencies): (signal: NodeJS.Signals) => void {
  return (signal) => {
    logger.info({ signal }, 'Shutting down');
    const schedulerStopped = scheduler.stop();
    server.close((error) => {
      if (error) {
        logger.error({ err: error }, 'Shutdown failed');
        exit(1);
        return;
      }
      schedulerStopped
        .then(() => tasks.drain())
        .then(() => db.destroy())
        .then(
          () => exit(0),
          (err: unknown) => {
            logger.error({ err }, 'Closing the database pool failed');
            exit(1);
          },
        );
    });
    server.closeIdleConnections();
    setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      exit(1);
    }, timeoutMs).unref();
  };
}
