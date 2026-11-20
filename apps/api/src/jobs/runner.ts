import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import { withJobLock } from './lock.js';

/** What one run did, as counts by name, such as `{ expired: 2 }`. */
export type JobCounts = Record<string, number>;

export interface ScheduledJob {
  /** Names the job in logs and its advisory lock. */
  name: string;
  /** A cron pattern on the Lagos clock. */
  schedule: string;
  run: () => Promise<JobCounts>;
}

export type JobOutcome = 'ran' | 'skipped' | 'failed';

export interface RunOptions {
  /** Milliseconds, for the logged duration. */
  clock?: () => number;
  lock?: typeof withJobLock;
}

/**
 * Runs a job under its advisory lock and logs the run: its counts and duration at info, a failure
 * at error. Never throws, so a failed run leaves the next one to try again.
 */
export async function runJob(
  db: Database,
  logger: Logger,
  job: ScheduledJob,
  { clock = performance.now.bind(performance), lock = withJobLock }: RunOptions = {},
): Promise<JobOutcome> {
  const started = clock();
  const durationMs = () => Math.round(clock() - started);
  try {
    const run = await lock(db, job.name, job.run);
    if (!run.ran) {
      logger.debug({ job: job.name }, 'Job skipped: another run holds its lock');
      return 'skipped';
    }
    logger.info({ job: job.name, counts: run.result, durationMs: durationMs() }, 'Job ran');
    return 'ran';
  } catch (err) {
    logger.error({ err, job: job.name, durationMs: durationMs() }, 'Job failed');
    return 'failed';
  }
}
