import { capacityUnitSchema, providerActionPath } from '@coldlink/shared';
import { sql } from 'kysely';
import * as z from 'zod';
import { issueProviderActionToken } from '../actions/tokens.js';
import type { TransitionHooks } from '../bookings/hooks.js';
import type { BookingTransition } from '../bookings/transition.js';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { bookingReceivedParams, type BookingSmsTemplates } from './bookingTemplates.js';
import { sendNotification, type NotificationDeps } from './send.js';

export interface ProviderActionLinks {
  /** Issues a token and returns the link that carries it. */
  issue(bookingId: string): Promise<string>;
  /** As issue, for a resend: undefined once the booking no longer waits for the provider. */
  reissue(bookingId: string): Promise<string | undefined>;
}

/**
 * Each link carries a new token, issued in its own short transaction, which the link is the only
 * copy of: neither the token nor the link is stored or logged (decision 104).
 */
export function createProviderActionLinks(db: Database, webAppUrl: string): ProviderActionLinks {
  const link = (token: string) => new URL(providerActionPath(token), webAppUrl).toString();
  return {
    issue: (bookingId) =>
      inTransaction(db, async (trx) => link(await issueProviderActionToken(trx, bookingId))),
    reissue: (bookingId) =>
      inTransaction(db, async (trx) => {
        const waiting = await trx
          .selectFrom('bookings')
          .select('id')
          .where('id', '=', bookingId)
          .where('status', '=', 'pending_provider')
          .where('provider_response_due_at', '>', sql<Date>`now()`)
          .executeTakeFirst();
        if (waiting === undefined) return undefined;
        return link(await issueProviderActionToken(trx, bookingId));
      }),
  };
}

// The facility's notification number goes only to the farmer, and only once the booking is
// confirmed; the farmer's number never reaches the provider (decision 105).
function readBooking(db: Database, bookingId: string) {
  return db
    .selectFrom('bookings')
    .innerJoin('providers', 'providers.id', 'bookings.provider_id')
    .innerJoin('crops', 'crops.id', 'bookings.crop_id')
    .innerJoin('users as farmers', 'farmers.id', 'bookings.farmer_id')
    .select([
      'bookings.code',
      'bookings.quantity',
      'bookings.capacity_unit',
      'bookings.start_date',
      'bookings.end_date',
      'bookings.deposit_kobo',
      'bookings.commission_kobo',
      'bookings.total_charged_online_kobo',
      'bookings.provider_response_due_at',
      'bookings.farmer_id',
      'farmers.phone as farmer_phone',
      'providers.owner_user_id',
      'providers.phone as provider_phone',
      'providers.display_name',
      'providers.address_text',
      'providers.landmark',
      'crops.name as crop_name',
    ])
    .where('bookings.id', '=', bookingId)
    .executeTakeFirstOrThrow();
}

type BookingRow = Awaited<ReturnType<typeof readBooking>>;

// settleCharge sets it in the transaction that moves the booking to pending_provider.
function responseDueAt({ provider_response_due_at: due }: BookingRow, bookingId: string): string {
  if (due === null) throw new Error(`Booking ${bookingId} has no provider response deadline`);
  return due.toISOString();
}

/**
 * Logs `booking_received` as queued with its stored params and nothing sent, for when no link
 * could be issued. Without the row nothing would retry and the provider would never hear of the
 * booking; the queue's resend issues a fresh link, and only while the booking still waits for the
 * provider (decision 104).
 */
async function queueWithoutLink(
  { store }: NotificationDeps<BookingSmsTemplates>,
  { to, userId }: { to: string; userId: string },
  params: z.input<typeof bookingReceivedParams>,
): Promise<void> {
  await store.insert({
    userId,
    recipientPhone: to,
    template: 'booking_received',
    payload: bookingReceivedParams.parse(params),
  });
}

export interface BookingSmsDependencies {
  db: Database;
  notifications: NotificationDeps<BookingSmsTemplates>;
  links: ProviderActionLinks;
}

/**
 * Texts the provider and the farmer after each booking transition PRD 7.6 names. Each is an
 * after-commit hook (decision 53), so a failed SMS never holds or undoes the change, and
 * sendNotification records the failure for a retry.
 */
export function registerBookingSmsHooks(
  hooks: TransitionHooks,
  { db, notifications, links }: BookingSmsDependencies,
): void {
  const toFarmer = (booking: BookingRow) => ({
    to: booking.farmer_phone,
    userId: booking.farmer_id,
  });

  hooks.afterCommit({
    name: 'sms_booking_received',
    on: { from: 'payment_pending', to: 'pending_provider' },
    run: async ({ bookingId }: BookingTransition) => {
      const booking = await readBooking(db, bookingId);
      const params = {
        booking_id: bookingId,
        code: booking.code,
        facility_name: booking.display_name,
        crop_name: booking.crop_name,
        quantity: booking.quantity,
        capacity_unit: capacityUnitSchema.parse(booking.capacity_unit),
        start_date: booking.start_date,
        end_date: booking.end_date,
        payout_kobo: booking.deposit_kobo - booking.commission_kobo,
        response_due_at: responseDueAt(booking, bookingId),
      };
      const recipient = { to: booking.provider_phone, userId: booking.owner_user_id };
      let link: string;
      try {
        link = await links.issue(bookingId);
      } catch (err) {
        await queueWithoutLink(notifications, recipient, params);
        notifications.logger.error(
          { err, bookingId },
          'Provider action link failed; booking_received queued for a retry',
        );
        return;
      }
      await sendNotification(notifications, {
        template: 'booking_received',
        params: { ...params, link },
        ...recipient,
      });
    },
  });

  hooks.afterCommit({
    name: 'sms_booking_paid',
    on: { from: 'payment_pending', to: 'pending_provider' },
    run: async ({ bookingId }) => {
      const booking = await readBooking(db, bookingId);
      await sendNotification(notifications, {
        template: 'booking_paid',
        params: {
          code: booking.code,
          facility_name: booking.display_name,
          response_due_at: responseDueAt(booking, bookingId),
        },
        ...toFarmer(booking),
      });
    },
  });

  hooks.afterCommit({
    name: 'sms_booking_confirmed',
    on: { to: 'confirmed' },
    run: async ({ bookingId }) => {
      const booking = await readBooking(db, bookingId);
      await sendNotification(notifications, {
        template: 'booking_confirmed',
        params: {
          code: booking.code,
          facility_name: booking.display_name,
          address_text: booking.address_text,
          landmark: booking.landmark,
          facility_phone: booking.provider_phone,
          start_date: booking.start_date,
        },
        ...toFarmer(booking),
      });
    },
  });

  const sendRejected =
    (reason: 'rejected' | 'expired') =>
    async ({ bookingId }: BookingTransition) => {
      const booking = await readBooking(db, bookingId);
      await sendNotification(notifications, {
        template: 'booking_rejected',
        params: {
          code: booking.code,
          facility_name: booking.display_name,
          reason,
          refund_kobo: booking.total_charged_online_kobo,
        },
        ...toFarmer(booking),
      });
    };
  hooks.afterCommit({
    name: 'sms_booking_rejected',
    on: { to: 'rejected' },
    run: sendRejected('rejected'),
  });
  hooks.afterCommit({
    name: 'sms_booking_expired',
    on: { from: 'pending_provider', to: 'expired' },
    run: sendRejected('expired'),
  });
}
