import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import type { BookingServices } from '../services.js';
import type { ScheduledJob } from './runner.js';

export interface JobDependencies {
  db: Database;
  logger: Logger;
  services: BookingServices;
  now?: () => Date;
}

/** The scheduled jobs of PRD 7.13, each on its schedule (decision 108). */
export function createJobs(_deps: JobDependencies): ScheduledJob[] {
  return [];
}
