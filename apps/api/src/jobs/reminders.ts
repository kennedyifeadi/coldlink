import {
  addDays,
  bookingReminderKinds,
  todayInLagos,
  type BookingReminderKind,
} from '@coldlink/shared';
import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { inTransaction } from '../db/transaction.js';
import type { SmsTemplateRegistry } from '../notifications/registry.js';
import {
  deliver,
  queueNotification,
  type Delivery,
  type NotificationDeps,
} from '../notifications/send.js';
import { createNotificationStore } from '../notifications/store.js';

// MTN blocks Termii's generic route from 8 PM to 8 AM (decision 50), and nobody wants a reminder
// at night, so reminders go out only from 8 AM to 8 PM in Lagos.
const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 20;
// Lagos is UTC+1 all year.
const LAGOS_OFFSET_HOURS = 1;

/** How many reminders of each kind one run sends at most; the rest go out the next hour. */
export const REMINDER_BATCH_SIZE = 200;

/** Whether `now` is from 8 AM up to, not including, 8 PM in Lagos. */
export function inSendWindow(now: Date): boolean {
  const hour = (now.getUTCHours() + LAGOS_OFFSET_HOURS) % 24;
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR;
}

export interface ReminderDue {
  /** The end dates a reminder of this kind is due for on that day, inclusive. */
  endDateFrom: string;
  endDateTo: string;
  /** Only bookings that start on or before their end date less two days. */
  startsTwoDaysBeforeEnd: boolean;
}

/**
 * Which bookings each reminder is due for on a Lagos calendar day (decision 74). The two-day
 * reminder is due on end_date − 2, or on end_date − 1 as a catch-up for a day it was missed; the
 * last-day and collection reminders on end_date itself.
 */
export function remindersDue(today: string): Record<BookingReminderKind, ReminderDue> {
  return {
    expiry_two_days_before: {
      endDateFrom: addDays(today, 1),
      endDateTo: addDays(today, 2),
      startsTwoDaysBeforeEnd: true,
    },
    expiry_last_day: { endDateFrom: today, endDateTo: today, startsTwoDaysBeforeEnd: false },
    collection_due: { endDateFrom: today, endDateTo: today, startsTwoDaysBeforeEnd: false },
  };
}

export interface ReminderDependencies {
  db: Database;
  notifications: NotificationDeps<SmsTemplateRegistry>;
  now?: () => Date;
}

async function claimBooking(
  trx: Transaction<DB>,
  kind: BookingReminderKind,
  due: ReminderDue,
  skip: readonly string[],
) {
  return trx
    .selectFrom('bookings')
    .select('id')
    .where('status', '=', 'in_storage')
    .where('end_date', '>=', due.endDateFrom)
    .where('end_date', '<=', due.endDateTo)
    .$if(due.startsTwoDaysBeforeEnd, (query) =>
      query.where(sql<boolean>`start_date <= end_date - 2`),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('booking_reminders')
            .select('booking_reminders.id')
            .whereRef('booking_reminders.booking_id', '=', 'bookings.id')
            .where('booking_reminders.kind', '=', kind),
        ),
      ),
    )
    .$if(skip.length > 0, (query) => query.where('id', 'not in', skip))
    .orderBy('end_date')
    .limit(1)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();
}

function readBooking(trx: Transaction<DB>, bookingId: string) {
  return trx
    .selectFrom('bookings')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .innerJoin('users as farmers', 'farmers.id', 'bookings.farmer_id')
    .select([
      'bookings.code',
      'bookings.end_date',
      'bookings.farmer_id',
      'farmers.phone as farmer_phone',
      'providers.owner_user_id',
      'providers.phone as provider_phone',
      'providers.display_name',
    ])
    .where('bookings.id', '=', bookingId)
    .executeTakeFirstOrThrow();
}

// The farmer is told the code, facility and last day; the provider the code and that the produce
// is due today. Neither message carries the other party's phone (decision 105).
function queueReminder(
  trx: Transaction<DB>,
  templates: SmsTemplateRegistry,
  kind: BookingReminderKind,
  booking: Awaited<ReturnType<typeof readBooking>>,
): Promise<Delivery> {
  const deps = { store: createNotificationStore(trx), templates };
  const facts = {
    code: booking.code,
    facility_name: booking.display_name,
    end_date: booking.end_date,
  };
  if (kind === 'collection_due') {
    return queueNotification(deps, {
      template: 'collection_reminder',
      params: facts,
      to: booking.provider_phone,
      userId: booking.owner_user_id,
    });
  }
  return queueNotification(deps, {
    template: 'expiry_reminder',
    params: { ...facts, kind },
    to: booking.farmer_phone,
    userId: booking.farmer_id,
  });
}

/**
 * Records the reminder and queues its SMS in one transaction, as the booking_reminders migration
 * requires: the insert's `on conflict do nothing` lets only one run ever queue a reminder, and the
 * notification is queued only if the insert went through.
 */
async function recordReminder(
  { db, notifications }: ReminderDependencies,
  kind: BookingReminderKind,
  due: ReminderDue,
  tried: string[],
): Promise<Delivery | 'none_due' | 'already_sent'> {
  return inTransaction(db, async (trx) => {
    const claimed = await claimBooking(trx, kind, due, tried);
    if (claimed === undefined) return 'none_due';
    tried.push(claimed.id);
    const reminder = await trx
      .insertInto('booking_reminders')
      .values({ booking_id: claimed.id, kind })
      .onConflict((oc) => oc.columns(['booking_id', 'kind']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (reminder === undefined) return 'already_sent';
    const booking = await readBooking(trx, claimed.id);
    const delivery = await queueReminder(trx, notifications.templates, kind, booking);
    await trx
      .updateTable('booking_reminders')
      .set({ notification_id: delivery.id })
      .where('id', '=', reminder.id)
      .execute();
    return delivery;
  });
}

/**
 * Sends the expiry and collection reminders due today in Lagos (PRD 7.6), from the first hourly
 * run inside the send window. Each booking gets each reminder once, however often this runs.
 */
export async function sendReminders(
  deps: ReminderDependencies,
  limit = REMINDER_BATCH_SIZE,
): Promise<Record<BookingReminderKind, number>> {
  const now = (deps.now ?? (() => new Date()))();
  const counts: Record<BookingReminderKind, number> = {
    expiry_two_days_before: 0,
    expiry_last_day: 0,
    collection_due: 0,
  };
  if (!inSendWindow(now)) return counts;
  const due = remindersDue(todayInLagos(now));
  for (const kind of bookingReminderKinds) {
    const tried: string[] = [];
    while (tried.length < limit) {
      const outcome = await recordReminder(deps, kind, due[kind], tried);
      if (outcome === 'none_due') break;
      if (outcome === 'already_sent') continue;
      await deliver(deps.notifications, outcome);
      counts[kind] += 1;
    }
  }
  return counts;
}
