import type { BookingStatus } from '@coldlink/shared';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { findProviderToken } from '../actions/tokens.js';
import { createTransitionHooks } from '../bookings/hooks.js';
import {
  runAfterCommitHooks,
  transitionBooking,
  type BookingActor,
} from '../bookings/transition.js';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { permanentFailure, retryableFailure, type FakeOutcome } from '../test/notifications.js';
import { bookingRow, setResponseDue, setStatus } from '../test/providerActions.js';
import { createConsoleSmsProvider } from '../sms/consoleProvider.js';
import type { SmsMessage, SmsProvider } from '../sms/provider.js';
import { createProviderActionLinks, registerBookingSmsHooks } from './bookingSmsHooks.js';
import { createBookingSmsTemplates } from './bookingTemplates.js';
import { processNotificationQueue } from './queue.js';
import { createNotificationStore } from './store.js';

// insertBooking's PRD 6.1 worked example: what was paid online, and the deposit less commission.
const PAID_ONLINE = 4_064_400;
const PAYOUT = 3_048_300;
const LINK = new RegExp(`^.*: ${testConfig.webAppUrl}/a/([A-Za-z0-9_-]{43})$`);

/** The console provider, recording each message so a test can read the link it carried. */
function recordingSms(logger: ReturnType<typeof captureLogs>['logger'], outcomes: FakeOutcome[]) {
  const console = createConsoleSmsProvider(logger);
  const sent: SmsMessage[] = [];
  const provider: SmsProvider = {
    send(message) {
      sent.push(message);
      const outcome = outcomes.shift() ?? 'ok';
      return outcome === 'ok' ? console.send(message) : Promise.reject(outcome);
    },
  };
  return { provider, sent };
}

function tokenIn(message: SmsMessage | undefined): string {
  const token = LINK.exec(message?.text ?? '')?.[1];
  if (token === undefined) throw new Error('The message carries no action link');
  return token;
}

describe.skipIf(noTestDatabase)('booking SMS hooks', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let phones: { farmer: string; provider: string };

  beforeEach(async () => {
    booking = await insertBooking(db(), 'payment_pending');
    await setResponseDue(db(), booking.bookingId, 120);
    const farmer = await db()
      .selectFrom('users')
      .select('phone')
      .where('id', '=', booking.farmerId)
      .executeTakeFirstOrThrow();
    const provider = await db()
      .selectFrom('providers')
      .select('phone')
      .where('id', '=', booking.providerId)
      .executeTakeFirstOrThrow();
    phones = { farmer: farmer.phone, provider: provider.phone };
  });

  function setup(...outcomes: FakeOutcome[]) {
    return setupWith({ outcomes });
  }

  function setupWith({
    outcomes = [],
    failToIssueLinks = false,
  }: {
    outcomes?: FakeOutcome[];
    failToIssueLinks?: boolean;
  }) {
    const logs = captureLogs();
    const sms = recordingSms(logs.logger, outcomes);
    const real = createProviderActionLinks(db(), testConfig.webAppUrl);
    const links = failToIssueLinks
      ? { ...real, issue: () => Promise.reject(new Error('Could not issue the token')) }
      : real;
    const notifications = {
      store: createNotificationStore(db()),
      sms: sms.provider,
      logger: logs.logger,
      templates: createBookingSmsTemplates({ relinkProvider: (id) => links.reissue(id) }),
    };
    const hooks = createTransitionHooks();
    registerBookingSmsHooks(hooks, { db: db(), notifications, links });

    // db() is the test's transaction, which cannot nest: decision 53's pattern for a caller
    // inside one is to transition, then run the after-commit hooks.
    async function move(from: BookingStatus, to: BookingStatus, actor: BookingActor) {
      await setStatus(db(), booking.bookingId, from);
      const result = await transitionBooking(db(), hooks, {
        bookingId: booking.bookingId,
        to,
        actor,
      });
      await runAfterCommitHooks(logs.logger, result);
      // The runner logs a hook's error rather than throwing it, so a broken hook shows only here.
      expect(logs.output()).not.toContain('Booking after-commit hook failed');
    }

    return { logs, sms, notifications, move };
  }

  const pay = (move: ReturnType<typeof setup>['move']) =>
    move('payment_pending', 'pending_provider', { type: 'system' });

  function notificationRows() {
    return db()
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', 'in', [booking.farmerId, booking.ownerId])
      .orderBy('created_at')
      .orderBy('template')
      .execute();
  }

  async function bookingFacts() {
    const row = await bookingRow(db(), booking.bookingId);
    return {
      code: row.code,
      responseDueAt: row.provider_response_due_at?.toISOString(),
      status: row.status,
    };
  }

  describe('when the farmer pays', () => {
    it('texts the provider the booking and the farmer the wait', async () => {
      const { move, logs } = setup();
      await pay(move);
      const { code, responseDueAt } = await bookingFacts();
      const crop = await db()
        .selectFrom('bookings')
        .innerJoin('crops', 'crops.id', 'bookings.crop_id')
        .select('crops.name')
        .where('bookings.id', '=', booking.bookingId)
        .executeTakeFirstOrThrow();

      expect(await notificationRows()).toEqual([
        expect.objectContaining({
          template: 'booking_paid',
          recipient_phone: phones.farmer,
          user_id: booking.farmerId,
          status: 'sent',
          payload: {
            code,
            facility_name: 'Booking test cold room',
            response_due_at: responseDueAt,
          },
        }),
        expect.objectContaining({
          template: 'booking_received',
          recipient_phone: phones.provider,
          user_id: booking.ownerId,
          status: 'sent',
          payload: {
            booking_id: booking.bookingId,
            code,
            facility_name: 'Booking test cold room',
            crop_name: crop.name,
            quantity: 2,
            capacity_unit: 'sqm',
            start_date: '2026-12-01',
            end_date: '2026-12-31',
            payout_kobo: PAYOUT,
            response_due_at: responseDueAt,
          },
        }),
      ]);
      const output = logs.output();
      expect(output).toContain('"template":"booking_received"');
      expect(output).toContain('"template":"booking_paid"');
      expect(output).toContain('SMS not sent: the console provider only logs it');
    });

    it('gives the provider a working link whose token is stored nowhere else', async () => {
      const { move, logs, sms } = setup();
      await pay(move);

      const received = sms.sent.find((message) => message.template === 'booking_received');
      const token = tokenIn(received);
      expect(received?.to).toBe(phones.provider);
      await expect(findProviderToken(db(), token)).resolves.toMatchObject({
        bookingId: booking.bookingId,
      });
      expect(JSON.stringify(await notificationRows())).not.toContain(token);
      expect(logs.output()).not.toContain(token);
      expect(logs.output()).not.toContain('/a/');
    });

    it("never gives either party the other's phone number", async () => {
      const { move, sms } = setup();
      await pay(move);

      const local = (phone: string) => phone.slice(4);
      const toProvider = sms.sent.find((message) => message.to === phones.provider);
      const toFarmer = sms.sent.find((message) => message.to === phones.farmer);
      expect(toProvider?.text).not.toContain(local(phones.farmer));
      expect(toFarmer?.text).not.toContain(local(phones.provider));
    });
  });

  it('gives the farmer the address and facility phone once the provider accepts', async () => {
    const { move, sms } = setup();
    await move('pending_provider', 'confirmed', { type: 'provider', id: booking.ownerId });
    const { code } = await bookingFacts();

    expect(await notificationRows()).toEqual([
      expect.objectContaining({
        template: 'booking_confirmed',
        recipient_phone: phones.farmer,
        status: 'sent',
        payload: {
          code,
          facility_name: 'Booking test cold room',
          address_text: 'Test address',
          landmark: null,
          facility_phone: phones.provider,
          start_date: '2026-12-01',
        },
      }),
    ]);
    expect(sms.sent).toHaveLength(1);
  });

  it.each([
    ['rejects it', 'rejected'],
    ['does not answer in time', 'expired'],
  ] as const)('tells the farmer a refund is coming when the provider %s', async (_case, to) => {
    const { move } = setup();
    const actor: BookingActor =
      to === 'rejected' ? { type: 'provider', id: booking.ownerId } : { type: 'system' };
    await move('pending_provider', to, actor);
    const { code } = await bookingFacts();

    expect(await notificationRows()).toEqual([
      expect.objectContaining({
        template: 'booking_rejected',
        recipient_phone: phones.farmer,
        status: 'sent',
        payload: {
          code,
          facility_name: 'Booking test cold room',
          reason: to,
          refund_kobo: PAID_ONLINE,
        },
      }),
    ]);
  });

  it('texts nobody when an unpaid hold expires', async () => {
    const { move, sms } = setup();
    await move('payment_pending', 'expired', { type: 'system' });

    expect(sms.sent).toEqual([]);
    expect(await notificationRows()).toEqual([]);
  });

  describe('when an SMS fails', () => {
    it('leaves the transition standing and records the failure', async () => {
      const { move, logs } = setup(permanentFailure(), retryableFailure());
      await pay(move);

      expect((await bookingFacts()).status).toBe('pending_provider');
      expect(await notificationRows()).toEqual([
        expect.objectContaining({
          template: 'booking_paid',
          status: 'queued',
          attempts: 1,
          error: 'Termii returned HTTP 503',
        }),
        expect.objectContaining({
          template: 'booking_received',
          status: 'failed',
          attempts: 1,
          error: 'Termii returned HTTP 401',
        }),
      ]);
      expect(logs.output()).toContain('SMS delivery failed');
    });

    // notifications_set_updated_at would overwrite the backdated value. The disable is inside the
    // test's transaction, so it rolls back with it.
    async function makeDue() {
      await sql`alter table public.notifications disable trigger notifications_set_updated_at`.execute(
        db(),
      );
      await db()
        .updateTable('notifications')
        .set({ updated_at: sql<Date>`now() - interval '2 minutes'` })
        .where('user_id', '=', booking.ownerId)
        .execute();
      await sql`alter table public.notifications enable trigger notifications_set_updated_at`.execute(
        db(),
      );
    }

    it('resends booking_received with a fresh token', async () => {
      const { move, sms, notifications, logs } = setup(retryableFailure());
      await pay(move);
      const first = tokenIn(sms.sent[0]);
      await makeDue();

      await expect(processNotificationQueue(notifications)).resolves.toMatchObject({ sent: 1 });
      const resent = sms.sent.at(-1);
      const second = tokenIn(resent);
      expect(resent?.to).toBe(phones.provider);
      expect(second).not.toBe(first);
      await expect(findProviderToken(db(), second)).resolves.toMatchObject({
        bookingId: booking.bookingId,
      });
      const rows = JSON.stringify(await notificationRows());
      expect(rows).not.toContain(first);
      expect(rows).not.toContain(second);
      expect(logs.output()).not.toContain(second);
    });

    it('queues booking_received when no link could be issued, and the queue sends it', async () => {
      const { move, sms, notifications, logs } = setupWith({ failToIssueLinks: true });
      await pay(move);

      expect((await bookingFacts()).status).toBe('pending_provider');
      expect(sms.sent.map((message) => message.template)).toEqual(['booking_paid']);
      const { code, responseDueAt } = await bookingFacts();
      expect(await notificationRows()).toContainEqual(
        expect.objectContaining({
          template: 'booking_received',
          recipient_phone: phones.provider,
          user_id: booking.ownerId,
          status: 'queued',
          attempts: 0,
          error: null,
          payload: expect.objectContaining({
            booking_id: booking.bookingId,
            code,
            response_due_at: responseDueAt,
          }) as unknown,
        }),
      );
      expect(logs.output()).toContain(
        'Provider action link failed; booking_received queued for a retry',
      );
      expect(logs.output()).toContain('"level":50');

      await makeDue();
      await expect(processNotificationQueue(notifications)).resolves.toMatchObject({ sent: 1 });
      const resent = sms.sent.at(-1);
      expect(resent?.to).toBe(phones.provider);
      await expect(findProviderToken(db(), tokenIn(resent))).resolves.toMatchObject({
        bookingId: booking.bookingId,
      });
    });

    it('does not resend booking_received once the booking has been answered', async () => {
      const { move, sms, notifications } = setup(retryableFailure());
      await pay(move);
      await move('pending_provider', 'confirmed', { type: 'provider', id: booking.ownerId });
      await makeDue();
      const sentBefore = sms.sent.length;

      await expect(processNotificationQueue(notifications)).resolves.toMatchObject({ failed: 1 });
      expect(sms.sent).toHaveLength(sentBefore);
      expect(await notificationRows()).toContainEqual(
        expect.objectContaining({
          template: 'booking_received',
          status: 'failed',
          error: 'The message no longer applies',
        }),
      );
    });
  });
});
