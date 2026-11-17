import { randomInt } from 'node:crypto';
import type { BookingStatus, UserRole } from '@coldlink/shared';
import { sql } from 'kysely';
import { createApp } from '../app.js';
import { createAccessTokens } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import { apiRoutes } from '../routes/index.js';
import { captureLogs, testConfig } from './helpers.js';
import { fakePaymentGateway } from './payments.js';

// The PRD 6.1 worked example that insertBooking prices: deposit ₦40,644 less commission ₦10,161.
export const WORKED_EXAMPLE = {
  depositKobo: 4_064_400,
  commissionKobo: 1_016_100,
  payoutKobo: 3_048_300,
} as const;

// 09:00 in Lagos on 10 November 2026, three weeks before insertBooking's 1 December start.
export const BEFORE_START = new Date('2026-11-10T08:00:00Z');
// 00:30 on 1 December in Lagos, while it is still 30 November in UTC.
export const START_DAY_IN_LAGOS = new Date('2026-11-30T23:30:00Z');

const tokens = createAccessTokens(testConfig.auth.jwtSecret);

export async function bearer(db: Database, userId: string): Promise<string> {
  const user = await db
    .selectFrom('users')
    .select(['id', 'coldlink_id', 'roles'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const token = await tokens.sign({
    sub: user.id,
    cid: user.coldlink_id,
    roles: user.roles as UserRole[],
  });
  return `Bearer ${token}`;
}

export async function insertUserWithRoles(db: Database, roles: UserRole[]): Promise<string> {
  const { id } = await db
    .insertInto('users')
    .values({
      phone: `+2348009${randomInt(100_000, 1_000_000)}`,
      coldlink_id: `${randomInt(1_000_000, 10_000_000)}`,
      roles,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return id;
}

/** The real app with a fake payment gateway, so a rejection's refund never reaches Paystack. */
export function providerActionsApp(db: Database, now: Date = BEFORE_START) {
  const logs = captureLogs();
  const payments = fakePaymentGateway();
  const routes = apiRoutes({
    db,
    config: testConfig,
    logger: logs.logger,
    paymentGateway: payments.gateway,
    now: () => now,
  });
  return { app: createApp(testConfig, { db, logger: logs.logger, routes }), logs, payments };
}

/** Puts the booking in `status`, with the cancelled_by the database requires of a cancellation. */
export async function setStatus(db: Database, bookingId: string, status: BookingStatus) {
  await db
    .updateTable('bookings')
    .set({ status, cancelled_by: status === 'cancelled' ? 'farmer' : null })
    .where('id', '=', bookingId)
    .execute();
}

/** Sets the provider's deadline `minutes` from the database's now; negative for one that passed. */
export async function setResponseDue(db: Database, bookingId: string, minutes: number) {
  await db
    .updateTable('bookings')
    .set({
      provider_response_due_at: sql<Date>`now() + make_interval(mins => ${minutes}::int)`,
    })
    .where('id', '=', bookingId)
    .execute();
}

export function bookingRow(db: Database, id: string) {
  return db.selectFrom('bookings').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

export function eventsFrom(db: Database, bookingId: string, from: BookingStatus) {
  return db
    .selectFrom('booking_events')
    .selectAll()
    .where('booking_id', '=', bookingId)
    .where('from_status', '=', from)
    .execute();
}
