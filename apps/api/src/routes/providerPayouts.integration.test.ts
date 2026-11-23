import { randomUUID } from 'node:crypto';
import { errorResponseSchema, providerPayoutsResponseSchema } from '@coldlink/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { bearer, insertUserWithRoles, providerActionsApp } from '../test/providerActions.js';
import { addBooking, addPayout } from '../test/providerDashboard.js';

const NOW = new Date('2026-12-10T09:00:00Z');
const FARMER_NAME = 'Payouts Test Farmer';

describe.skipIf(noTestDatabase)('GET /providers/:id/payouts against Postgres', () => {
  const db = useTestTransaction();
  let facility: BookingFixture;
  let ownerAuth: string;
  let farmerPhone: string;
  let admin: string;

  beforeEach(async () => {
    facility = await insertBooking(db(), 'payment_pending');
    ownerAuth = await bearer(db(), facility.ownerId);
    admin = await insertUserWithRoles(db(), ['admin']);
    const farmer = await db()
      .updateTable('users')
      .set({ full_name: FARMER_NAME })
      .where('id', '=', facility.farmerId)
      .returning('phone')
      .executeTakeFirstOrThrow();
    farmerPhone = farmer.phone;
  });

  function get(query = '', auth = ownerAuth, id = facility.providerId) {
    return request(providerActionsApp(db(), NOW).app)
      .get(`/api/v1/providers/${id}/payouts${query}`)
      .set('Authorization', auth);
  }

  async function page(query = '', auth = ownerAuth) {
    const response = await get(query, auth);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return providerPayoutsResponseSchema.parse(response.body);
  }

  /** A checked-in booking at the facility with its payout, owed unless paid. */
  async function payout({
    createdAt,
    amountKobo = 1_000_000,
    paid = false,
  }: {
    createdAt: string;
    amountKobo?: number;
    paid?: boolean;
  }) {
    const bookingId = await addBooking(db(), facility, {
      status: paid ? 'completed' : 'in_storage',
      startDate: createdAt.slice(0, 10),
    });
    return addPayout(db(), {
      bookingId,
      providerId: facility.providerId,
      amountKobo,
      createdAt,
      ...(paid ? { paidBy: admin } : {}),
    });
  }

  describe('who may read', () => {
    beforeEach(async () => {
      await payout({ createdAt: '2026-12-01T10:00:00Z' });
    });

    it('answers another provider and an unknown facility with the same 404, uncached', async () => {
      const other = await insertBooking(db(), 'in_storage');
      const theirs = await get('', await bearer(db(), other.ownerId));
      const unknown = await get('', ownerAuth, randomUUID());
      expect(theirs.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(theirs.headers['cache-control']).toBe('no-store');
      expect(unknown.headers['cache-control']).toBe('no-store');
      expect(unknown.body).toEqual(theirs.body);
      expect(errorResponseSchema.parse(theirs.body).error).toEqual({
        code: 'not_found',
        message: 'Facility not found',
      });
    });

    it('lets an admin who does not own the facility read it', async () => {
      const body = await page('', await bearer(db(), admin));
      expect(body.data).toHaveLength(1);
      expect(body.earnings).toEqual({ owed_kobo: 1_000_000, paid_kobo: 0 });
    });
  });

  it('lists the payouts newest first, with the booking each is for', async () => {
    const oldest = await payout({ createdAt: '2026-11-20T10:00:00Z', amountKobo: 500_000 });
    const newest = await payout({ createdAt: '2026-12-05T10:00:00Z', amountKobo: 3_048_300 });
    const middle = await payout({
      createdAt: '2026-12-01T10:00:00Z',
      amountKobo: 1_000_050,
      paid: true,
    });

    const body = await page();
    expect(body.data.map(({ id }) => id)).toEqual([newest, middle, oldest]);
    expect(body.next_cursor).toBeNull();
    expect(body.data[0]).toMatchObject({
      amount_kobo: 3_048_300,
      status: 'owed',
      created_at: '2026-12-05T10:00:00.000Z',
      paid_at: null,
      reference: null,
      booking: { start_date: '2026-12-05', duration_days: 10, end_date: '2026-12-15' },
    });
    expect(body.data[0]?.booking.code).toMatch(/^CL-/);
    expect(body.data[1]).toMatchObject({ status: 'paid', reference: 'TRF-TEST' });
    expect(body.data[1]?.paid_at).not.toBeNull();
    expect(body.earnings).toEqual({ owed_kobo: 3_548_300, paid_kobo: 1_000_050 });
  });

  it('breaks a tie on the time by id, newest id first', async () => {
    const ids = [
      await payout({ createdAt: '2026-12-01T10:00:00Z' }),
      await payout({ createdAt: '2026-12-01T10:00:00Z' }),
      await payout({ createdAt: '2026-12-01T10:00:00Z' }),
    ];
    expect((await page()).data.map(({ id }) => id)).toEqual([...ids].sort().reverse());
  });

  it('filters by status, and keeps the totals of every payout', async () => {
    const owed = await payout({ createdAt: '2026-12-02T10:00:00Z', amountKobo: 700_000 });
    const paid = await payout({
      createdAt: '2026-12-01T10:00:00Z',
      amountKobo: 300_000,
      paid: true,
    });

    const owedPage = await page('?status=owed');
    expect(owedPage.data.map(({ id }) => id)).toEqual([owed]);
    const paidPage = await page('?status=paid');
    expect(paidPage.data.map(({ id }) => id)).toEqual([paid]);
    for (const body of [owedPage, paidPage]) {
      expect(body.earnings).toEqual({ owed_kobo: 700_000, paid_kobo: 300_000 });
    }
  });

  it('pages by keyset with limit and cursor, repeating and skipping none', async () => {
    const ids: string[] = [];
    for (const day of ['05', '04', '03', '02', '01']) {
      ids.push(await payout({ createdAt: `2026-12-${day}T10:00:00Z` }));
    }

    const first = await page('?limit=2');
    expect(first.data.map(({ id }) => id)).toEqual(ids.slice(0, 2));
    expect(first.next_cursor).toBe(ids[1]);
    const second = await page(`?limit=2&cursor=${first.next_cursor}`);
    expect(second.data.map(({ id }) => id)).toEqual(ids.slice(2, 4));
    const last = await page(`?limit=2&cursor=${second.next_cursor}`);
    expect(last.data.map(({ id }) => id)).toEqual(ids.slice(4));
    expect(last.next_cursor).toBeNull();
  });

  it('pages within a status filter', async () => {
    const paid = [
      await payout({ createdAt: '2026-12-05T10:00:00Z', paid: true }),
      await payout({ createdAt: '2026-12-03T10:00:00Z', paid: true }),
    ];
    await payout({ createdAt: '2026-12-04T10:00:00Z' });

    const first = await page('?status=paid&limit=1');
    expect(first.data.map(({ id }) => id)).toEqual([paid[0]]);
    const second = await page(`?status=paid&limit=1&cursor=${first.next_cursor}`);
    expect(second.data.map(({ id }) => id)).toEqual([paid[1]]);
    expect(second.next_cursor).toBeNull();
  });

  it("gives an empty page for a cursor that is not one of the facility's payouts", async () => {
    await payout({ createdAt: '2026-12-01T10:00:00Z' });
    const other = await insertBooking(db(), 'in_storage');
    const theirs = await addPayout(db(), {
      bookingId: other.bookingId,
      providerId: other.providerId,
      amountKobo: 777_700,
    });

    for (const cursor of [theirs, randomUUID()]) {
      const body = await page(`?cursor=${cursor}`);
      expect(body.data).toEqual([]);
      expect(body.next_cursor).toBeNull();
    }
  });

  it("lists only this facility's payouts, and is empty with zero totals when there are none", async () => {
    const other = await insertBooking(db(), 'in_storage');
    await addPayout(db(), {
      bookingId: other.bookingId,
      providerId: other.providerId,
      amountKobo: 777_700,
    });

    expect(await page()).toEqual({
      data: [],
      next_cursor: null,
      earnings: { owed_kobo: 0, paid_kobo: 0 },
    });
  });

  it('never sends who recorded a payment or anything about the farmer', async () => {
    await payout({ createdAt: '2026-12-02T10:00:00Z' });
    await payout({ createdAt: '2026-12-01T10:00:00Z', paid: true });

    for (const query of ['', '?status=paid', '?status=owed']) {
      // The schema is strict, so parsing proves no extra field; the text check covers values.
      const text = JSON.stringify(await page(query));
      expect(text).not.toContain('recorded_by');
      expect(text).not.toContain(admin);
      expect(text).not.toContain('farmer');
      expect(text).not.toContain(facility.farmerId);
      expect(text).not.toContain(farmerPhone.slice(-10));
      expect(text).not.toContain(FARMER_NAME);
    }
  });
});
