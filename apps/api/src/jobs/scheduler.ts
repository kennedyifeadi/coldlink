import { Cron } from 'croner';
import type { Logger } from 'pino';
import type { ScheduledJob } from './runner.js';

const LAGOS = 'Africa/Lagos';

export interface Scheduler {
  /** Starts each job on its schedule. Calling it again does nothing. */
  start(): void;
  /**
   * Starts no more runs, tells those in progress to end after the row in hand, and resolves once
   * they have.
   */
  stop(): Promise<void>;
}

export interface SchedulerOptions {
  jobs: readonly ScheduledJob[];
  logger: Logger;
  /** Runs one job; `runJob` with the process's database, which logs it and never throws. */
  run: (job: ScheduledJob, signal: AbortSignal) => Promise<unknown>;
}

/**
 * Runs the jobs in this process on the Lagos clock. A job still running when its next time comes
 * is not started again here (`protect`); across instances the advisory lock does the same.
 */
export function createScheduler({ jobs, logger, run }: SchedulerOptions): Scheduler {
  const crons: Cron[] = [];
  const running = new Set<Promise<void>>();
  const stopping = new AbortController();

  function track(job: ScheduledJob): Promise<void> {
    const current = run(job, stopping.signal)
      .then(() => undefined)
      .finally(() => running.delete(current));
    running.add(current);
    return current;
  }

  return {
    start() {
      if (crons.length > 0) return;
      for (const job of jobs) {
        crons.push(
          new Cron(job.schedule, { name: job.name, timezone: LAGOS, protect: true }, () =>
            track(job),
          ),
        );
      }
      logger.info({ jobs: jobs.map((job) => job.name) }, 'Scheduler started');
    },

    async stop() {
      for (const cron of crons.splice(0)) cron.stop();
      stopping.abort();
      while (running.size > 0) await Promise.allSettled(running);
      logger.info('Scheduler stopped');
    },
  };
}
