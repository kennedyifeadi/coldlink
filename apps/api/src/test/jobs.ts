import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { createBookingServices } from '../services.js';
import { captureLogs, testConfig } from './helpers.js';
import { fakeSmsProvider } from './notifications.js';
import { fakePaymentGateway } from './payments.js';

/**
 * The services a job runs with, as server.ts builds them, but with a fake SMS provider and payment
 * gateway so nothing reaches Termii or Paystack.
 */
export function jobServices(db: Database) {
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
  return {
    logs,
    sms,
    payments,
    services,
    deps: { db, hooks: services.hooks, logger: logs.logger },
  };
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
