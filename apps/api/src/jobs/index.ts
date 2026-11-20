import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import { processNotificationQueue } from '../notifications/queue.js';
import type { BookingServices } from '../services.js';
import { expireUnanswered } from './expireUnanswered.js';
import { releaseHolds } from './releaseHolds.js';
import type { ScheduledJob } from './runner.js';

export interface JobDependencies {
  db: Database;
  logger: Logger;
  services: BookingServices;
  now?: () => Date;
}

const EVERY_MINUTE = '* * * * *';

/** The scheduled jobs of PRD 7.13, each on its schedule on the Lagos clock (decision 108). */
export function createJobs({ db, logger, services }: JobDependencies): ScheduledJob[] {
  const bookings = { db, hooks: services.hooks, logger };
  return [
    { name: 'release_holds', schedule: EVERY_MINUTE, run: () => releaseHolds(bookings) },
    { name: 'expire_unanswered', schedule: EVERY_MINUTE, run: () => expireUnanswered(bookings) },
    // retryPolicy.ts counts its delays from a run every minute.
    {
      name: 'sms_queue',
      schedule: EVERY_MINUTE,
      run: () => processNotificationQueue(services.notifications),
    },
  ];
}
