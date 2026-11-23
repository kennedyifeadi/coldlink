import { sql } from 'kysely';
import { createAppConfigReader } from '../appConfig.js';
import type { Database } from '../db/client.js';
import { createJobs } from '../jobs/index.js';
import type { ScheduledJob } from '../jobs/runner.js';
import { createBookingServices } from '../services.js';
import { captureLogs, testConfig } from './helpers.js';
import { fakeSmsProvider } from './notifications.js';
import { fakePaymentGateway } from './payments.js';

/**
 * The services a job runs with, as server.ts builds them, but with a fake SMS provider and payment
 * gateway so nothing reaches Termii or Paystack.
 */
export function jobServices(db: Database, now?: () => Date) {
  const logs = captureLogs();
  const sms = fakeSmsProvider();
  const payments = fakePaymentGateway();
  const services = createBookingServices({
    db,
    config: testConfig,
    logger: logs.logger,
    sms: sms.provider,
    gateway: payments.gateway,
  });
  const jobs = createJobs({
    db,
    logger: logs.logger,
    services,
    ...(now === undefined ? {} : { now }),
  });
  function job(name: string): ScheduledJob {
    const found = jobs.find((scheduled) => scheduled.name === name);
    if (found === undefined) throw new Error(`No job ${name}`);
    return found;
  }
  return {
    logs,
    sms,
    payments,
    services,
    job,
    deps: {
      db,
      hooks: services.hooks,
      logger: logs.logger,
      gateway: payments.gateway,
      appConfig: createAppConfigReader(db),
    },
  };
}

/**
 * Backdates the users' queued notifications so the queue's retry delay has passed.
 * notifications_set_updated_at would overwrite the value, so it is disabled around the update,
 * inside the test's transaction, which rolls the disable back with everything else.
 */
export async function makeNotificationsDue(db: Database, userIds: string[]): Promise<void> {
  await sql`alter table public.notifications disable trigger notifications_set_updated_at`.execute(
    db,
  );
  await db
    .updateTable('notifications')
    .set({ updated_at: sql<Date>`now() - interval '2 minutes'` })
    .where('user_id', 'in', userIds)
    .execute();
  await sql`alter table public.notifications enable trigger notifications_set_updated_at`.execute(
    db,
  );
}

/** Sets a booking deadline `seconds` from the database's now; 0 for exactly now. */
export async function setDeadline(
  db: Database,
  bookingId: string,
  column: 'payment_expires_at' | 'provider_response_due_at',
  seconds: number,
): Promise<void> {
  await db
    .updateTable('bookings')
    .set({ [column]: sql<Date>`now() + make_interval(secs => ${seconds}::int)` })
    .where('id', '=', bookingId)
    .execute();
}

export function notificationsFor(db: Database, userIds: string[]) {
  return db
    .selectFrom('notifications')
    .selectAll()
    .where('user_id', 'in', userIds)
    .orderBy('created_at')
    .orderBy('template')
    .execute();
}

export function eventsOf(db: Database, bookingId: string) {
  return db
    .selectFrom('booking_events')
    .select(['from_status', 'to_status', 'actor_type', 'actor_id', 'metadata'])
    .where('booking_id', '=', bookingId)
    .orderBy('created_at')
    .execute();
}
