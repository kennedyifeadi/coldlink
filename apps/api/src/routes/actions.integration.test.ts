import { createHash } from 'node:crypto';
import {
  providerBookingRequestSchema,
  providerLinkActionResultSchema,
  type ProviderLinkAction,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { issueProviderActionToken } from '../actions/tokens.js';
import { createDatabase, type Database } from '../db/client.js';
import { deleteBooking, insertBooking, type BookingFixture } from '../test/bookings.js';
import { captureLogs } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { insertCharge, paymentRows } from '../test/payments.js';
import {
  bearer,
  bookingRow,
  eventsFrom,
  providerActionsApp,
  setResponseDue,
  WORKED_EXAMPLE,
} from '../test/providerActions.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';

const NOT_FOUND = {
  error: { code: 'not_found', message: 'This link has expired or has already been used' },
};

function tokenRows(db: Database, bookingId: string) {
  return db.selectFrom('action_tokens').selectAll().where('subject_id', '=', bookingId).execute();
}

describe.skipIf(noTestDatabase)('provider action links against Postgres', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let token: string;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'pending_provider');
    await setResponseDue(db(), booking.bookingId, 60);
    token = await issueProviderActionToken(db(), booking.bookingId);
  });

  function open(link = token) {
    const target = providerActionsApp(db());
    return { target, response: request(target.app).get(`/api/v1/actions/${link}`) };
  }

  function answer(action: ProviderLinkAction, link = token) {
    const target = providerActionsApp(db());
    return {
      target,
      response: request(target.app).post(`/api/v1/actions/${link}`).send({ action }),
    };
  }

  describe('issueProviderActionToken', () => {
    it('stores only the SHA-256 hash of a 256-bit token, for 12 hours', async () => {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      const rows = await tokenRows(db(), booking.bookingId);
      expect(rows).toEqual([
        expect.objectContaining({
          token_hash: createHash('sha256').update(token).digest('hex'),
          purpose: 'provider_respond_booking',
          used_at: null,
        }),
      ]);
      expect(JSON.stringify(rows)).not.toContain(token);
      const { rows: lifetime } = await sql<{ hours: number }>`
        select extract(epoch from expires_at - now()) / 3600 as hours
        from public.action_tokens where subject_id = ${booking.bookingId}
      `.execute(db());
      expect(Number(lifetime[0]?.hours)).toBe(12);
    });

    it('gives a different token each time', async () => {
      expect(await issueProviderActionToken(db(), booking.bookingId)).not.toBe(token);
    });
  });

  describe('GET /actions/:token', () => {
    it('shows only what the provider needs to decide', async () => {
      const response = await open().response;
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(providerBookingRequestSchema.parse(response.body)).toEqual({
        facility_name: 'Booking test cold room',
        crop_name: expect.any(String) as string,
        quantity: 2,
        capacity_unit: 'sqm',
        start_date: '2026-12-01',
        duration_days: 30,
        end_date: '2026-12-31',
        payout_kobo: WORKED_EXAMPLE.payoutKobo,
      });
      const farmer = await db()
        .selectFrom('users')
        .select('phone')
        .where('id', '=', booking.farmerId)
        .executeTakeFirstOrThrow();
      expect(JSON.stringify(response.body)).not.toContain(farmer.phone.slice(4));
    });

    it('does not use the link', async () => {
      await open().response;
      expect((await open().response).status).toBe(200);
    });
  });

  describe('POST /actions/:token', () => {
    it('accepts as the facility owner and uses the link', async () => {
      const response = await answer('accept').response;
      expect(response.status).toBe(200);
      expect(providerLinkActionResultSchema.parse(response.body)).toEqual({ status: 'confirmed' });
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('confirmed');
      expect(await eventsFrom(db(), booking.bookingId, 'pending_provider')).toMatchObject([
        { to_status: 'confirmed', actor_type: 'provider', actor_id: booking.ownerId },
      ]);
      expect((await tokenRows(db(), booking.bookingId))[0]?.used_at).toBeInstanceOf(Date);
    });

    it('rejects and refunds the farmer once', async () => {
      const chargeReference = await insertCharge(db(), {
        bookingId: booking.bookingId,
        status: 'success',
        amountKobo: WORKED_EXAMPLE.depositKobo,
      });
      const { target, response } = answer('reject');
      expect((await response).body).toEqual({ status: 'rejected' });
      expect(target.payments.refunds).toEqual([
        { chargeReference, amountKobo: WORKED_EXAMPLE.depositKobo },
      ]);
      expect((await paymentRows(db(), booking.bookingId)).map((row) => row.purpose)).toEqual([
        'booking_deposit',
        'refund',
      ]);
    });

    it('works once: a used link is the same 404 to open or answer', async () => {
      expect((await answer('accept').response).status).toBe(200);
      for (const response of [await answer('reject').response, await open().response]) {
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND);
      }
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('confirmed');
    });

    it('keeps the link when the deadline has passed, refusing with a 409', async () => {
      await setResponseDue(db(), booking.bookingId, -1);
      expect((await answer('accept').response).status).toBe(409);
      expect((await tokenRows(db(), booking.bookingId))[0]?.used_at).toBeNull();
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('pending_provider');
    });

    it('is a 409 for a booking already answered from the dashboard, and keeps the link', async () => {
      const target = providerActionsApp(db());
      await request(target.app)
        .post(`/api/v1/bookings/${booking.bookingId}/reject`)
        .set('Authorization', await bearer(db(), booking.ownerId));
      expect((await answer('accept').response).status).toBe(409);
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('rejected');
      expect((await tokenRows(db(), booking.bookingId))[0]?.used_at).toBeNull();
    });
  });

  describe('a link that cannot be used', () => {
    async function expectSame404(link: string) {
      const responses = [
        await open(link).response,
        await answer('accept', link).response,
        await answer('reject', link).response,
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND);
      }
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('pending_provider');
    }

    it('is 404 once expired', async () => {
      await db()
        .updateTable('action_tokens')
        .set({ expires_at: sql<Date>`now() - interval '1 second'` })
        .where('subject_id', '=', booking.bookingId)
        .execute();
      await expectSame404(token);
    });

    it('is 404 at the moment it expires', async () => {
      await db()
        .updateTable('action_tokens')
        .set({ expires_at: sql<Date>`now()` })
        .where('subject_id', '=', booking.bookingId)
        .execute();
      await expectSame404(token);
    });

    it('is 404 for a token issued for another purpose', async () => {
      const delivery = 'Dq7_x-1ZxYv0LmN2pQrStUvWxYz0123456789abcDE';
      await db()
        .insertInto('action_tokens')
        .values({
          token_hash: createHash('sha256').update(delivery).digest('hex'),
          purpose: 'delivery_accept',
          subject_id: booking.bookingId,
          expires_at: sql<Date>`now() + interval '12 hours'`,
        })
        .execute();
      await expectSame404(delivery);
    });

    it.each(['Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE', 'x', 'not%20a%20token'])(
      'is 404 for the unknown token %s',
      async (link) => {
        await expectSame404(link);
      },
    );

    it('is 404 for the hash itself', async () => {
      await expectSame404(createHash('sha256').update(token).digest('hex'));
    });
  });

  it('never writes the token to the request log', async () => {
    const opened = open();
    await opened.response;
    const answered = answer('accept');
    await answered.response;
    const reused = answer('accept');
    await reused.response;
    for (const { target } of [opened, answered, reused]) {
      const text = target.logs.output();
      expect(text).toContain('"url":"/api/v1/actions/[Redacted]"');
      expect(text).not.toContain(token);
    }
  });
});

// Commits, since both requests must wait on the booking's row lock held by another connection,
// and the second sees the first's answer only once it is committed. The rows are deleted
// afterwards (decision 53).
describe.skipIf(noTestDatabase)('the SMS link and the dashboard answering at once', () => {
  let pool: Database | undefined;

  function database(): Database {
    if (pool === undefined) throw new Error('No pool');
    return pool;
  }

  beforeAll(() => {
    pool = createDatabase(
      { databaseUrl: requireTestDatabaseUrl(), databaseSslRootCert: undefined },
      captureLogs().logger,
    );
  });
  afterAll(async () => {
    await pool?.destroy();
  });

  async function waitForLockWaits(count: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await sql<{ waiting: number }>`
        select count(*)::int as waiting from pg_catalog.pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `.execute(database());
      if ((rows[0]?.waiting ?? 0) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${count} requests never waited on the booking lock`);
  }

  it('lets exactly one of accept by link and reject by dashboard win', async () => {
    const db = database();
    const fixture = await insertBooking(db, 'pending_provider');
    try {
      await setResponseDue(db, fixture.bookingId, 60);
      await insertCharge(db, {
        bookingId: fixture.bookingId,
        status: 'success',
        amountKobo: WORKED_EXAMPLE.depositKobo,
      });
      const token = await db
        .transaction()
        .execute((trx) => issueProviderActionToken(trx, fixture.bookingId));
      const target = providerActionsApp(db);
      const auth = await bearer(db, fixture.ownerId);

      const holder = await db.startTransaction().execute();
      let responses: Promise<request.Response[]> = Promise.resolve([]);
      try {
        await holder
          .selectFrom('bookings')
          .select('id')
          .where('id', '=', fixture.bookingId)
          .forUpdate()
          .execute();
        responses = Promise.all([
          request(target.app)
            .post(`/api/v1/actions/${token}`)
            .send({ action: 'accept' })
            .then((response) => response),
          request(target.app)
            .post(`/api/v1/bookings/${fixture.bookingId}/reject`)
            .set('Authorization', auth)
            .then((response) => response),
        ]);
        await waitForLockWaits(2);
        await holder.commit().execute();
      } catch (error) {
        await holder.rollback().execute();
        throw error;
      }

      const [link, dashboard] = await responses;
      expect([link?.status, dashboard?.status].toSorted((a = 0, b = 0) => a - b)).toEqual([
        200, 409,
      ]);
      expect(await eventsFrom(db, fixture.bookingId, 'pending_provider')).toHaveLength(1);
      const [tokenRow] = await tokenRows(db, fixture.bookingId);
      const outcome = {
        status: (await bookingRow(db, fixture.bookingId)).status,
        linkUsed: tokenRow?.used_at instanceof Date,
        refunds: target.payments.refunds.length,
      };
      // The winner's change stands whole: the link uses itself only when it won.
      expect(outcome).toEqual(
        link?.status === 200
          ? { status: 'confirmed', linkUsed: true, refunds: 0 }
          : { status: 'rejected', linkUsed: false, refunds: 1 },
      );
    } finally {
      await db.deleteFrom('action_tokens').where('subject_id', '=', fixture.bookingId).execute();
      await db.deleteFrom('payments').where('booking_id', '=', fixture.bookingId).execute();
      await deleteBooking(db, fixture);
    }
  });
});
