import type { Logger } from 'pino';
import type { Database } from '../db/client.js';
import { processNotificationQueue } from '../notifications/queue.js';
import { retryFailedRefunds } from '../payments/refundRetry.js';
import type { BookingServices } from '../services.js';
import { expireUnanswered } from './expireUnanswered.js';
import { flagNoShowCandidates } from './noShowCandidates.js';
import { releaseHolds } from './releaseHolds.js';
import { sendReminders } from './reminders.js';
import type { ScheduledJob } from './runner.js';

export interface JobDependencies {
  db: Database;
  logger: Logger;
  services: BookingServices;
  now?: () => Date;
}

const EVERY_MINUTE = '* * * * *';

/** The scheduled jobs of PRD 7.13, each on its schedule on the Lagos clock (decision 114). */
export function createJobs({ db, logger, services, now }: JobDependencies): ScheduledJob[] {
  const bookings = { db, hooks: services.hooks, logger };
  return [
    {
      name: 'release_holds',
      schedule: EVERY_MINUTE,
      run: (signal) => releaseHolds({ ...bookings, signal }),
    },
    {
      name: 'expire_unanswered',
      schedule: EVERY_MINUTE,
      run: (signal) => expireUnanswered({ ...bookings, signal }),
    },
    // retryPolicy.ts counts its delays from a run every minute.
    {
      name: 'sms_queue',
      schedule: EVERY_MINUTE,
      run: (signal) => processNotificationQueue(services.notifications, undefined, signal),
    },
    {
      name: 'refund_retry',
      schedule: '*/5 * * * *',
      run: (signal) => retryFailedRefunds({ db, gateway: services.gateway, logger, signal }),
    },
    {
      name: 'reminders',
      schedule: '0 * * * *',
      run: (signal) =>
        sendReminders({
          db,
          signal,
          notifications: services.notifications,
          ...(now === undefined ? {} : { now }),
        }),
    },
    // Just after Lagos midnight, once yesterday's start days have all passed.
    {
      name: 'no_show_candidates',
      schedule: '5 0 * * *',
      run: () => flagNoShowCandidates({ db, ...(now === undefined ? {} : { now }) }),
    },
  ];
}
