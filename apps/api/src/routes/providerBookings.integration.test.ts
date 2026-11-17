import { randomUUID } from 'node:crypto';
import {
  bookingStatuses,
  errorResponseSchema,
  providerBookingSchema,
  type BookingStatus,
} from '@coldlink/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../db/client.js';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { insertCharge, paymentRows } from '../test/payments.js';
import {
  bearer,
  BEFORE_START,
  bookingRow,
  eventsFrom,
  insertUserWithRoles,
  providerActionsApp,
  setResponseDue,
  setStatus,
  START_DAY_IN_LAGOS,
  WORKED_EXAMPLE,
} from '../test/providerActions.js';

type Action = 'accept' | 'reject' | 'check-in' | 'collect';

const moves: Record<Action, { from: BookingStatus; to: BookingStatus }> = {
  accept: { from: 'pending_provider', to: 'confirmed' },
  reject: { from: 'pending_provider', to: 'rejected' },
  'check-in': { from: 'confirmed', to: 'in_storage' },
  collect: { from: 'in_storage', to: 'completed' },
};
const actions = Object.keys(moves) as Action[];

function payouts(db: Database, bookingId: string) {
  return db.selectFrom('payouts').selectAll().where('booking_id', '=', bookingId).execute();
}

describe.skipIf(noTestDatabase)('provider booking actions against Postgres', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let ownerAuth: string;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'pending_provider');
    await setResponseDue(db(), booking.bookingId, 60);
    ownerAuth = await bearer(db(), booking.ownerId);
  });

  function post(
    action: Action,
    { auth = ownerAuth, now = BEFORE_START, id = booking.bookingId, body = {} } = {},
  ) {
    const target = providerActionsApp(db(), now);
    const response = request(target.app)
      .post(`/api/v1/bookings/${id}/${action}`)
      .set('Authorization', auth)
      .send(body);
    return { target, response };
  }

  async function expectStatus(status: BookingStatus) {
    expect((await bookingRow(db(), booking.bookingId)).status).toBe(status);
  }

  describe('by the owner', () => {
    it('accepts, and logs the owner as the provider who did it', async () => {
      const response = await post('accept').response;
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = providerBookingSchema.parse(response.body);
      expect(body).toMatchObject({ id: booking.bookingId, status: 'confirmed' });
      expect(await eventsFrom(db(), booking.bookingId, 'pending_provider')).toMatchObject([
        { to_status: 'confirmed', actor_type: 'provider', actor_id: booking.ownerId },
      ]);
    });

    it('rejects with a reason, kept in the event', async () => {
      const response = await post('reject', { body: { reason: '  No space this week ' } }).response;
      expect(providerBookingSchema.parse(response.body).status).toBe('rejected');
      expect(await eventsFrom(db(), booking.bookingId, 'pending_provider')).toMatchObject([
        { to_status: 'rejected', metadata: { reason: 'No space this week' } },
      ]);
    });

    it('rejects without a body', async () => {
      const target = providerActionsApp(db());
      const response = await request(target.app)
        .post(`/api/v1/bookings/${booking.bookingId}/reject`)
        .set('Authorization', ownerAuth);
      expect(response.status).toBe(200);
      await expectStatus('rejected');
    });

    it('refunds a rejection once, through the existing after-commit hook', async () => {
      const chargeReference = await insertCharge(db(), {
        bookingId: booking.bookingId,
        status: 'success',
        amountKobo: WORKED_EXAMPLE.depositKobo,
      });
      const { target, response } = post('reject');
      expect((await response).status).toBe(200);
      expect(target.logs.output()).not.toContain('Booking after-commit hook failed');
      expect(target.payments.refunds).toEqual([
        { chargeReference, amountKobo: WORKED_EXAMPLE.depositKobo },
      ]);
      expect((await paymentRows(db(), booking.bookingId)).map((row) => row.status)).toEqual([
        'refunded',
        'success',
      ]);
    });

    it('checks in on the start date in Lagos and records the payout owed', async () => {
      await setStatus(db(), booking.bookingId, 'confirmed');
      const response = await post('check-in', { now: START_DAY_IN_LAGOS }).response;
      expect(response.status).toBe(200);
      const body = providerBookingSchema.parse(response.body);
      expect(body.status).toBe('in_storage');
      expect(body.checked_in_at).not.toBeNull();
      // PRD 6.1: deposit ₦40,644 − commission ₦10,161 = ₦30,483.
      expect(body.payout_kobo).toBe(WORKED_EXAMPLE.payoutKobo);
      expect(await payouts(db(), booking.bookingId)).toEqual([
        expect.objectContaining({
          provider_id: booking.providerId,
          amount_kobo: WORKED_EXAMPLE.depositKobo - WORKED_EXAMPLE.commissionKobo,
          status: 'owed',
          paid_at: null,
        }),
      ]);
      expect(WORKED_EXAMPLE.depositKobo - WORKED_EXAMPLE.commissionKobo).toBe(3_048_300);
    });

    it('cannot check in before the start date in Lagos', async () => {
      await setStatus(db(), booking.bookingId, 'confirmed');
      // 23:30 UTC on 30 November is 00:30 on 1 December in Lagos; half an hour earlier is not.
      const response = await post('check-in', { now: new Date('2026-11-30T22:30:00Z') }).response;
      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error).toMatchObject({
        code: 'conflict',
        details: { booking_id: booking.bookingId, start_date: '2026-12-01' },
      });
      await expectStatus('confirmed');
      expect(await payouts(db(), booking.bookingId)).toEqual([]);
    });

    it('checks in after the start date too', async () => {
      await setStatus(db(), booking.bookingId, 'confirmed');
      const response = await post('check-in', { now: new Date('2026-12-05T08:00:00Z') }).response;
      expect(response.status).toBe(200);
    });

    it('collects', async () => {
      await setStatus(db(), booking.bookingId, 'in_storage');
      const response = await post('collect').response;
      const body = providerBookingSchema.parse(response.body);
      expect(body.status).toBe('completed');
      expect(body.collected_at).not.toBeNull();
    });

    it('takes a booking through accept, check-in and collect', async () => {
      expect((await post('accept').response).status).toBe(200);
      expect((await post('check-in', { now: START_DAY_IN_LAGOS }).response).status).toBe(200);
      expect((await post('collect', { now: START_DAY_IN_LAGOS }).response).status).toBe(200);
      await expectStatus('completed');
      expect(await payouts(db(), booking.bookingId)).toHaveLength(1);
    });

    it('never shows the farmer', async () => {
      const response = await post('accept').response;
      const farmer = await db()
        .selectFrom('users')
        .select(['phone', 'coldlink_id'])
        .where('id', '=', booking.farmerId)
        .executeTakeFirstOrThrow();
      const text = JSON.stringify(response.body);
      expect(text).not.toContain(farmer.phone.slice(4));
      expect(text).not.toContain(farmer.coldlink_id);
      expect(text).not.toContain(booking.farmerId);
    });
  });

  describe.each(actions)('%s, from every status it does not move from', (action) => {
    const disallowed = bookingStatuses.filter((status) => status !== moves[action].from);

    it.each(disallowed)('is 409 from %s and changes nothing', async (status) => {
      await setStatus(db(), booking.bookingId, status);
      const response = await post(action, { now: START_DAY_IN_LAGOS }).response;
      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error).toMatchObject({
        code: 'conflict',
        details: { booking_id: booking.bookingId, from: status, to: moves[action].to },
      });
      await expectStatus(status);
      expect(await eventsFrom(db(), booking.bookingId, status)).toEqual([]);
    });
  });

  describe('the response deadline', () => {
    it.each(['accept', 'reject'] as const)('refuses to %s once it has passed', async (action) => {
      await setResponseDue(db(), booking.bookingId, -1);
      const { target, response } = post(action);
      const answer = await response;
      expect(answer.status).toBe(409);
      expect(errorResponseSchema.parse(answer.body).error).toEqual({
        code: 'conflict',
        message: 'The time to answer this booking has passed',
        details: { booking_id: booking.bookingId },
      });
      await expectStatus('pending_provider');
      // The expiry job (#30) refunds it; nothing is refunded here.
      expect(target.payments.refunds).toEqual([]);
    });

    it('holds for an admin as well', async () => {
      await setResponseDue(db(), booking.bookingId, -1);
      const adminAuth = await bearer(db(), await insertUserWithRoles(db(), ['admin']));
      expect((await post('accept', { auth: adminAuth }).response).status).toBe(409);
    });
  });

  describe('who may act', () => {
    let otherProviderAuth: string;

    beforeEach(async () => {
      otherProviderAuth = await bearer(db(), await insertUserWithRoles(db(), ['provider']));
    });

    it.each(actions)(
      "is the same 404 for another provider's booking as for an unknown one (%s)",
      async (action) => {
        await setStatus(db(), booking.bookingId, moves[action].from);
        const theirs = await post(action, { auth: otherProviderAuth, now: START_DAY_IN_LAGOS })
          .response;
        const unknownId = randomUUID();
        const unknown = await post(action, { id: unknownId, now: START_DAY_IN_LAGOS }).response;
        const notFound = (id: string) => ({
          error: { code: 'not_found', message: 'Booking not found', details: { booking_id: id } },
        });
        expect([theirs.status, unknown.status]).toEqual([404, 404]);
        expect(theirs.body).toEqual(notFound(booking.bookingId));
        expect(unknown.body).toEqual(notFound(unknownId));
        await expectStatus(moves[action].from);
      },
    );

    it.each(['accept', 'reject'] as const)(
      'lets an admin %s, logged as the admin',
      async (action) => {
        const adminId = await insertUserWithRoles(db(), ['admin']);
        const response = await post(action, { auth: await bearer(db(), adminId) }).response;
        expect(response.status).toBe(200);
        expect(await eventsFrom(db(), booking.bookingId, 'pending_provider')).toMatchObject([
          { to_status: moves[action].to, actor_type: 'admin', actor_id: adminId },
        ]);
      },
    );

    it.each(['check-in', 'collect'] as const)(
      'gives a provider-and-admin who does not own the facility a 404 for %s',
      async (action) => {
        await setStatus(db(), booking.bookingId, moves[action].from);
        const auth = await bearer(db(), await insertUserWithRoles(db(), ['provider', 'admin']));
        expect((await post(action, { auth, now: START_DAY_IN_LAGOS }).response).status).toBe(404);
      },
    );

    it('gives an unknown admin booking a 404', async () => {
      const adminAuth = await bearer(db(), await insertUserWithRoles(db(), ['admin']));
      expect((await post('accept', { auth: adminAuth, id: randomUUID() }).response).status).toBe(
        404,
      );
    });
  });
});
