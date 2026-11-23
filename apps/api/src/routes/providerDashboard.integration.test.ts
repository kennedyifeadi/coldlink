import { randomUUID } from 'node:crypto';
import {
  errorResponseSchema,
  providerBookingDetailSchema,
  providerBookingsResponseSchema,
  providerDashboardSchema,
  type ProviderBookingGroup,
} from '@coldlink/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { bearer, insertUserWithRoles, providerActionsApp } from '../test/providerActions.js';
import { addBooking, addPayout } from '../test/providerDashboard.js';

// 10:00 on 10 December 2026 in Lagos.
const NOW = new Date('2026-12-10T09:00:00Z');
const TODAY = '2026-12-10';
const FARMER_NAME = 'Dashboard Test Farmer';

describe.skipIf(noTestDatabase)('provider dashboard and booking reads against Postgres', () => {
  const db = useTestTransaction();
  let facility: BookingFixture;
  let ownerAuth: string;
  let farmerPhone: string;

  beforeEach(async () => {
    // The fixture's own booking is an unpaid hold with no expiry: never put to the facility, and
    // holding no space.
    facility = await insertBooking(db(), 'payment_pending');
    ownerAuth = await bearer(db(), facility.ownerId);
    const farmer = await db()
      .updateTable('users')
      .set({ full_name: FARMER_NAME })
      .where('id', '=', facility.farmerId)
      .returning('phone')
      .executeTakeFirstOrThrow();
    farmerPhone = farmer.phone;
  });

  function get(path: string, auth = ownerAuth) {
    return request(providerActionsApp(db(), NOW).app)
      .get(`/api/v1${path}`)
      .set('Authorization', auth);
  }

  const dashboardPath = (id = facility.providerId) => `/providers/${id}/dashboard`;
  const listPath = (group: ProviderBookingGroup, query = '', id = facility.providerId) =>
    `/providers/${id}/bookings?group=${group}${query}`;
  const detailPath = (bookingId: string, id = facility.providerId) =>
    `/providers/${id}/bookings/${bookingId}`;

  async function listIds(group: ProviderBookingGroup, query = '') {
    const response = await get(listPath(group, query));
    expect(response.status).toBe(200);
    return providerBookingsResponseSchema.parse(response.body);
  }

  describe('who may read', () => {
    let bookingId: string;

    beforeEach(async () => {
      bookingId = await addBooking(db(), facility, { status: 'confirmed', startDate: TODAY });
    });

    it('answers another provider and an unknown facility with the same 404, uncached', async () => {
      const other = await insertBooking(db(), 'confirmed');
      const otherAuth = await bearer(db(), other.ownerId);
      for (const path of [dashboardPath(), listPath('upcoming'), detailPath(bookingId)]) {
        const theirs = await get(path, otherAuth);
        const unknown = await get(path.replace(facility.providerId, randomUUID()));
        expect(theirs.status).toBe(404);
        expect(theirs.headers['cache-control']).toBe('no-store');
        expect(unknown.status).toBe(404);
        expect(unknown.body).toEqual(theirs.body);
        expect(errorResponseSchema.parse(theirs.body).error).toEqual({
          code: 'not_found',
          message: 'Facility not found',
        });
      }
    });

    it('refuses a farmer before any lookup', async () => {
      const response = await get(dashboardPath(), await bearer(db(), facility.farmerId));
      expect(response.status).toBe(403);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('needs a session', async () => {
      const response = await request(providerActionsApp(db(), NOW).app).get(
        `/api/v1${dashboardPath()}`,
      );
      expect(response.status).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('lets an admin who does not own the facility read all three', async () => {
      const adminAuth = await bearer(db(), await insertUserWithRoles(db(), ['admin']));
      const dashboard = await get(dashboardPath(), adminAuth);
      expect(dashboard.status).toBe(200);
      expect(providerDashboardSchema.parse(dashboard.body).upcoming.count).toBe(1);
      const list = await get(listPath('upcoming'), adminAuth);
      expect(providerBookingsResponseSchema.parse(list.body).data.map((b) => b.id)).toEqual([
        bookingId,
      ]);
      const detail = await get(detailPath(bookingId), adminAuth);
      expect(providerBookingDetailSchema.parse(detail.body).id).toBe(bookingId);
    });

    it('sends no-store on every success', async () => {
      for (const path of [dashboardPath(), listPath('upcoming'), detailPath(bookingId)]) {
        expect((await get(path)).headers['cache-control']).toBe('no-store');
      }
    });
  });

  describe('dashboard', () => {
    it('counts the space booked today across overlapping bookings, in the facility unit', async () => {
      // Each covers 10 December: in storage, confirmed, awaiting an answer and a live hold.
      await addBooking(db(), facility, {
        status: 'in_storage',
        startDate: '2026-12-01',
        quantity: 2,
      });
      await addBooking(db(), facility, { status: 'confirmed', startDate: TODAY, quantity: 3.5 });
      await addBooking(db(), facility, {
        status: 'pending_provider',
        startDate: '2026-12-08',
        days: 3,
        quantity: 1.25,
        responseDueMinutes: 60,
      });
      await addBooking(db(), facility, {
        status: 'payment_pending',
        startDate: TODAY,
        quantity: 0.75,
        holdMinutes: 30,
      });
      // None of these holds space today: ended on the 10th, starts tomorrow, over, lapsed hold.
      await addBooking(db(), facility, {
        status: 'in_storage',
        startDate: '2026-11-30',
        days: 10,
        quantity: 9,
      });
      await addBooking(db(), facility, {
        status: 'confirmed',
        startDate: '2026-12-11',
        quantity: 9,
      });
      await addBooking(db(), facility, {
        status: 'completed',
        startDate: '2026-12-05',
        quantity: 9,
      });
      await addBooking(db(), facility, {
        status: 'payment_pending',
        startDate: TODAY,
        quantity: 9,
        holdMinutes: -1,
      });

      const response = await get(dashboardPath());
      expect(response.status).toBe(200);
      expect(providerDashboardSchema.parse(response.body).occupancy).toEqual({
        date: TODAY,
        used: 7.5,
        total: 50,
        capacity_unit: 'sqm',
      });
    });

    it('takes today from the Lagos clock', async () => {
      await addBooking(db(), facility, {
        status: 'confirmed',
        startDate: '2026-12-11',
        quantity: 4,
      });
      // 23:30 UTC on 10 December is already 11 December in Lagos.
      const response = await request(providerActionsApp(db(), new Date('2026-12-10T23:30:00Z')).app)
        .get(`/api/v1${dashboardPath()}`)
        .set('Authorization', ownerAuth);
      expect(providerDashboardSchema.parse(response.body).occupancy).toMatchObject({
        date: '2026-12-11',
        used: 4,
      });
    });

    it('shows the first five of each list with the full counts', async () => {
      const requests: string[] = [];
      for (const minutes of [90, 30, 150, 60, 120, 10]) {
        requests.push(
          await addBooking(db(), facility, {
            status: 'pending_provider',
            startDate: '2026-12-20',
            responseDueMinutes: minutes,
          }),
        );
      }
      const later = await addBooking(db(), facility, {
        status: 'confirmed',
        startDate: '2026-12-15',
      });
      const sooner = await addBooking(db(), facility, {
        status: 'confirmed',
        startDate: '2026-12-12',
      });
      const stored = await addBooking(db(), facility, {
        status: 'in_storage',
        startDate: '2026-12-05',
      });
      await addBooking(db(), facility, { status: 'completed', startDate: '2026-12-01' });

      const dashboard = providerDashboardSchema.parse((await get(dashboardPath())).body);
      // Soonest deadline first: 10, 30, 60, 90 and 120 minutes; the 150-minute one is left out.
      expect(dashboard.requests.count).toBe(6);
      expect(dashboard.requests.items.map((item) => item.id)).toEqual([
        requests[5],
        requests[1],
        requests[3],
        requests[0],
        requests[4],
      ]);
      expect(dashboard.upcoming).toMatchObject({ count: 2 });
      expect(dashboard.upcoming.items.map((item) => item.id)).toEqual([sooner, later]);
      expect(dashboard.in_storage.count).toBe(1);
      expect(dashboard.in_storage.items.map((item) => item.id)).toEqual([stored]);
      expect(dashboard.provider).toEqual({
        id: facility.providerId,
        display_name: 'Booking test cold room',
      });
    });

    it('sums the payouts owed and paid, and only this facility’s', async () => {
      const admin = await insertUserWithRoles(db(), ['admin']);
      const stored = await addBooking(db(), facility, {
        status: 'in_storage',
        startDate: '2026-12-05',
      });
      const collected = await addBooking(db(), facility, {
        status: 'completed',
        startDate: '2026-11-20',
      });
      const earlier = await addBooking(db(), facility, {
        status: 'completed',
        startDate: '2026-11-01',
      });
      await addPayout(db(), {
        bookingId: stored,
        providerId: facility.providerId,
        amountKobo: 3_048_300,
      });
      await addPayout(db(), {
        bookingId: collected,
        providerId: facility.providerId,
        amountKobo: 1_000_050,
      });
      await addPayout(db(), {
        bookingId: earlier,
        providerId: facility.providerId,
        amountKobo: 500_000,
        paidBy: admin,
      });
      const other = await insertBooking(db(), 'in_storage');
      await addPayout(db(), {
        bookingId: other.bookingId,
        providerId: other.providerId,
        amountKobo: 777_700,
      });

      const dashboard = providerDashboardSchema.parse((await get(dashboardPath())).body);
      expect(dashboard.earnings).toEqual({ owed_kobo: 4_048_350, paid_kobo: 500_000 });
    });

    it('is all zeros and empty lists for a facility with no bookings', async () => {
      const dashboard = providerDashboardSchema.parse((await get(dashboardPath())).body);
      expect(dashboard).toMatchObject({
        occupancy: { used: 0, total: 50 },
        requests: { count: 0, items: [] },
        upcoming: { count: 0, items: [] },
        in_storage: { count: 0, items: [] },
        earnings: { owed_kobo: 0, paid_kobo: 0 },
      });
    });
  });

  describe('bookings list', () => {
    it('puts each status in its group, and leaves out holds never put to the facility', async () => {
      const ids = {
        requests: await addBooking(db(), facility, {
          status: 'pending_provider',
          startDate: '2026-12-20',
          responseDueMinutes: 60,
        }),
        upcoming: await addBooking(db(), facility, {
          status: 'confirmed',
          startDate: '2026-12-20',
        }),
        in_storage: await addBooking(db(), facility, {
          status: 'in_storage',
          startDate: '2026-12-05',
        }),
      };
      const past = [];
      for (const status of ['completed', 'rejected', 'expired', 'cancelled', 'no_show'] as const) {
        past.push(await addBooking(db(), facility, { status, startDate: '2026-11-01' }));
      }
      // An unpaid hold that lapsed is expired too, but the facility never heard of it.
      const lapsedHold = await addBooking(db(), facility, {
        status: 'expired',
        startDate: '2026-11-01',
        asked: false,
      });

      for (const group of ['requests', 'upcoming', 'in_storage'] as const) {
        expect((await listIds(group)).data.map((item) => item.id)).toEqual([ids[group]]);
      }
      const pastIds = (await listIds('past')).data.map((item) => item.id);
      expect([...pastIds].sort()).toEqual([...past].sort());
      expect(pastIds).not.toContain(lapsedHold);
      expect(pastIds).not.toContain(facility.bookingId);
    });

    it('orders each group as it is used', async () => {
      const due = async (minutes: number) =>
        addBooking(db(), facility, {
          status: 'pending_provider',
          startDate: '2026-12-20',
          responseDueMinutes: minutes,
        });
      const [dueLater, dueSoon] = [await due(100), await due(20)];
      expect((await listIds('requests')).data.map((item) => item.id)).toEqual([dueSoon, dueLater]);

      const arriving = async (startDate: string) =>
        addBooking(db(), facility, { status: 'confirmed', startDate });
      const [arrivesLater, arrivesSoon] = [
        await arriving('2026-12-30'),
        await arriving('2026-12-12'),
      ];
      expect((await listIds('upcoming')).data.map((item) => item.id)).toEqual([
        arrivesSoon,
        arrivesLater,
      ]);

      // In storage by the soonest collection: the 20-day stay from the 1st ends after the 5-day one.
      const long = await addBooking(db(), facility, {
        status: 'in_storage',
        startDate: '2026-12-01',
        days: 20,
      });
      const short = await addBooking(db(), facility, {
        status: 'in_storage',
        startDate: '2026-12-08',
        days: 5,
      });
      expect((await listIds('in_storage')).data.map((item) => item.id)).toEqual([short, long]);

      const ended = async (startDate: string) =>
        addBooking(db(), facility, { status: 'completed', startDate });
      const [older, newer] = [await ended('2026-10-01'), await ended('2026-11-15')];
      expect((await listIds('past')).data.map((item) => item.id)).toEqual([newer, older]);
    });

    it('pages with limit and cursor, ties broken by id', async () => {
      const sameDay = [];
      for (let index = 0; index < 3; index += 1) {
        sameDay.push(
          await addBooking(db(), facility, { status: 'completed', startDate: '2026-11-01' }),
        );
      }
      const newest = await addBooking(db(), facility, {
        status: 'completed',
        startDate: '2026-11-20',
      });
      const expected = [newest, ...[...sameDay].sort().reverse()];

      const first = await listIds('past', '&limit=2');
      expect(first.data.map((item) => item.id)).toEqual(expected.slice(0, 2));
      expect(first.next_cursor).toBe(expected[1]);
      const second = await listIds('past', `&limit=2&cursor=${first.next_cursor}`);
      expect(second.data.map((item) => item.id)).toEqual(expected.slice(2));
      expect(second.next_cursor).toBeNull();
    });

    it('pages requests by deadlines to the microsecond', async () => {
      const ids = [];
      for (const minutes of [10, 20, 30]) {
        ids.push(
          await addBooking(db(), facility, {
            status: 'pending_provider',
            startDate: '2026-12-20',
            responseDueMinutes: minutes,
          }),
        );
      }
      const first = await listIds('requests', '&limit=1');
      const second = await listIds('requests', `&limit=1&cursor=${first.next_cursor}`);
      const third = await listIds('requests', `&limit=1&cursor=${second.next_cursor}`);
      expect([...first.data, ...second.data, ...third.data].map((item) => item.id)).toEqual(ids);
      expect(third.next_cursor).toBeNull();
    });

    it('gives an empty page for a cursor from another facility', async () => {
      await addBooking(db(), facility, { status: 'completed', startDate: '2026-11-01' });
      const other = await insertBooking(db(), 'completed');
      const page = await listIds('past', `&cursor=${other.bookingId}`);
      expect(page).toEqual({ data: [], next_cursor: null });
    });

    it('needs a known group and a limit up to 50', async () => {
      for (const query of ['', '?group=all', '?group=past&limit=51']) {
        const response = await get(`/providers/${facility.providerId}/bookings${query}`);
        expect(response.status).toBe(400);
        expect(errorResponseSchema.parse(response.body).error.code).toBe('validation_failed');
      }
    });
  });

  describe('booking detail', () => {
    it('adds the status history, oldest first, without who moved it', async () => {
      const bookingId = await addBooking(db(), facility, {
        status: 'pending_provider',
        startDate: TODAY,
      });
      const response = await get(detailPath(bookingId));
      expect(response.status).toBe(200);
      const detail = providerBookingDetailSchema.parse(response.body);
      expect(detail).toMatchObject({ id: bookingId, status: 'pending_provider', quantity: 1 });
      expect(detail.status_history.map((change) => change.status)).toEqual([
        'payment_pending',
        'pending_provider',
      ]);
      expect(Object.keys(detail.status_history[0] ?? {}).sort()).toEqual(['at', 'status']);
    });

    it('is a 404 for another facility’s booking, an unknown one and an unpaid hold', async () => {
      const other = await insertBooking(db(), 'confirmed');
      for (const bookingId of [other.bookingId, randomUUID(), facility.bookingId]) {
        const response = await get(detailPath(bookingId));
        expect(response.status).toBe(404);
        expect(errorResponseSchema.parse(response.body).error).toMatchObject({
          code: 'not_found',
          message: 'Booking not found',
        });
      }
    });
  });

  it('never sends a farmer field in any response', async () => {
    const bookingId = await addBooking(db(), facility, {
      status: 'pending_provider',
      startDate: TODAY,
      responseDueMinutes: 60,
    });
    await addBooking(db(), facility, { status: 'confirmed', startDate: TODAY });
    await addBooking(db(), facility, { status: 'in_storage', startDate: '2026-12-05' });
    await addBooking(db(), facility, { status: 'completed', startDate: '2026-11-05' });

    const bodies: unknown[] = [
      providerDashboardSchema.parse((await get(dashboardPath())).body),
      providerBookingDetailSchema.parse((await get(detailPath(bookingId))).body),
    ];
    for (const group of ['requests', 'upcoming', 'in_storage', 'past'] as const) {
      bodies.push(await listIds(group));
    }
    // The schemas are strict, so parsing proves no extra field; the text check covers values.
    for (const body of bodies) {
      const text = JSON.stringify(body);
      expect(text).not.toContain('farmer');
      expect(text).not.toContain(facility.farmerId);
      expect(text).not.toContain(farmerPhone.slice(-10));
      expect(text).not.toContain(FARMER_NAME);
    }
  });
});
