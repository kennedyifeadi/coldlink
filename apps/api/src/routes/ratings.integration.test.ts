import { randomUUID } from 'node:crypto';
import {
  bookingStatuses,
  errorResponseSchema,
  farmerBookingSchema,
  RATING_COMMENT_MAX_LENGTH,
  type BookingStatus,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { lockProvider } from '../providers/store.js';
import {
  deleteBooking,
  insertBooking,
  insertBookingFor,
  type BookingFixture,
} from '../test/bookings.js';
import { captureLogs } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import {
  bearer,
  insertUserWithRoles,
  providerActionsApp,
  setStatus,
} from '../test/providerActions.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';

function ratingRows(db: Database, providerId: string) {
  return db
    .selectFrom('ratings')
    .select(['booking_id', 'farmer_id', 'provider_id', 'stars', 'comment'])
    .where('provider_id', '=', providerId)
    .orderBy('created_at')
    .execute();
}

function providerRating(db: Database, providerId: string) {
  return db
    .selectFrom('providers')
    .select(['avg_rating', 'rating_count'])
    .where('id', '=', providerId)
    .executeTakeFirstOrThrow();
}

function rate(db: Database, bookingId: string, auth: string, body: object = { stars: 4 }) {
  return request(providerActionsApp(db).app)
    .post(`/api/v1/bookings/${bookingId}/rating`)
    .set('Authorization', auth)
    .send(body);
}

describe.skipIf(noTestDatabase)('POST /bookings/:id/rating against Postgres', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let farmerAuth: string;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'completed');
    farmerAuth = await bearer(db(), booking.farmerId);
  });

  const post = (body: object = { stars: 4 }, id = booking.bookingId, auth = farmerAuth) =>
    rate(db(), id, auth, body);

  async function rated(response: request.Response) {
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    return farmerBookingSchema.parse(response.body);
  }

  async function refused(response: request.Response, status: number) {
    expect(response.status).toBe(status);
    return errorResponseSchema.parse(response.body).error;
  }

  /** Another completed booking of the same farmer at the same facility. */
  const anotherBooking = () => insertBookingFor(db(), booking, 'completed');

  it('rates a completed booking and answers with the booking and its rating', async () => {
    const result = await rated(await post({ stars: 4, comment: 'Cold and clean' }));

    expect(result).toMatchObject({
      id: booking.bookingId,
      status: 'completed',
      rating: { stars: 4, comment: 'Cold and clean' },
    });
    expect(Date.parse(result.rating?.created_at ?? '')).not.toBeNaN();
    await expect(providerRating(db(), booking.providerId)).resolves.toEqual({
      avg_rating: 4,
      rating_count: 1,
    });
  });

  it('takes the farmer and the facility from the booking', async () => {
    await rated(await post({ stars: 5 }));

    await expect(ratingRows(db(), booking.providerId)).resolves.toEqual([
      {
        booking_id: booking.bookingId,
        farmer_id: booking.farmerId,
        provider_id: booking.providerId,
        stars: 5,
        comment: null,
      },
    ]);
  });

  it('shows the rating on GET /bookings/:id, and null before it', async () => {
    const read = () =>
      request(providerActionsApp(db()).app)
        .get(`/api/v1/bookings/${booking.bookingId}`)
        .set('Authorization', farmerAuth);

    expect(farmerBookingSchema.parse((await read()).body).rating).toBeNull();
    await rated(await post({ stars: 3, comment: 'Far from the road' }));
    expect(farmerBookingSchema.parse((await read()).body).rating).toMatchObject({
      stars: 3,
      comment: 'Far from the road',
    });
  });

  describe('the body', () => {
    it('trims the comment', async () => {
      const result = await rated(await post({ stars: 4, comment: '  Cold and clean \n' }));
      expect(result.rating?.comment).toBe('Cold and clean');
    });

    it('stores a blank comment as null', async () => {
      const result = await rated(await post({ stars: 4, comment: '   ' }));
      expect(result.rating?.comment).toBeNull();
      await expect(ratingRows(db(), booking.providerId)).resolves.toMatchObject([
        { comment: null },
      ]);
    });

    it(`takes a comment of ${RATING_COMMENT_MAX_LENGTH} characters and refuses a longer one`, async () => {
      const longest = 'x'.repeat(RATING_COMMENT_MAX_LENGTH);
      const error = await refused(await post({ stars: 4, comment: `${longest}x` }), 400);
      expect(error.code).toBe('validation_failed');
      await expect(ratingRows(db(), booking.providerId)).resolves.toEqual([]);

      const result = await rated(await post({ stars: 4, comment: ` ${longest} ` }));
      expect(result.rating?.comment).toBe(longest);
    });

    it.each([0, 6, 2.5])('refuses %j stars and stores nothing', async (stars) => {
      const error = await refused(await post({ stars }), 400);
      expect(error.code).toBe('validation_failed');
      await expect(ratingRows(db(), booking.providerId)).resolves.toEqual([]);
    });

    it('refuses an unknown field, such as another facility', async () => {
      const other = await insertBooking(db(), 'completed');
      const error = await refused(await post({ stars: 1, provider_id: other.providerId }), 400);
      expect(error.code).toBe('validation_failed');
      await expect(ratingRows(db(), other.providerId)).resolves.toEqual([]);
    });
  });

  describe('eligibility', () => {
    it.each(bookingStatuses.filter((status) => status !== 'completed'))(
      'refuses a %s booking with a 409 that says so',
      async (status: BookingStatus) => {
        await setStatus(db(), booking.bookingId, status);

        const error = await refused(await post(), 409);

        expect(error).toEqual({
          code: 'conflict',
          message: 'Only a completed booking can be rated',
          details: { booking_id: booking.bookingId, status },
        });
        await expect(ratingRows(db(), booking.providerId)).resolves.toEqual([]);
        await expect(providerRating(db(), booking.providerId)).resolves.toEqual({
          avg_rating: 0,
          rating_count: 0,
        });
      },
    );

    it('refuses a second rating and keeps the first', async () => {
      await rated(await post({ stars: 5, comment: 'Very good' }));

      const error = await refused(await post({ stars: 1 }), 409);

      expect(error).toEqual({
        code: 'conflict',
        message: 'This booking has already been rated',
        details: { booking_id: booking.bookingId },
      });
      await expect(ratingRows(db(), booking.providerId)).resolves.toMatchObject([
        { stars: 5, comment: 'Very good' },
      ]);
      await expect(providerRating(db(), booking.providerId)).resolves.toEqual({
        avg_rating: 5,
        rating_count: 1,
      });
    });
  });

  describe('ownership', () => {
    it("is the same 404 for another farmer's booking as for an unknown id", async () => {
      const otherFarmer = await insertUserWithRoles(db(), ['farmer']);
      const otherAuth = await bearer(db(), otherFarmer);

      const theirs = await refused(await post({ stars: 1 }, booking.bookingId, otherAuth), 404);
      const unknown = await refused(await post({ stars: 1 }, randomUUID()), 404);

      expect(theirs).toMatchObject({ code: 'not_found', message: 'Booking not found' });
      expect(unknown.message).toBe(theirs.message);
      expect(unknown.code).toBe(theirs.code);
      await expect(ratingRows(db(), booking.providerId)).resolves.toEqual([]);
    });

    it('needs the farmer role, so the facility cannot rate itself', async () => {
      const ownerAuth = await bearer(db(), booking.ownerId);
      const error = await refused(await post({ stars: 5 }, booking.bookingId, ownerAuth), 403);
      expect(error.code).toBe('forbidden');
    });
  });

  describe("the facility's average", () => {
    async function rateAll(stars: number[]) {
      const ids = [booking.bookingId];
      for (let index = 1; index < stars.length; index += 1) ids.push(await anotherBooking());
      for (const [index, id] of ids.entries()) {
        await rated(await post({ stars: stars[index] }, id));
      }
    }

    it('is recomputed from every rating, rounded to 2 places as stored', async () => {
      await rateAll([5, 4, 4]);
      await expect(providerRating(db(), booking.providerId)).resolves.toEqual({
        avg_rating: 4.33,
        rating_count: 3,
      });
    });

    it('rounds half away from zero, as numeric does', async () => {
      // 37 / 8 = 4.625
      await rateAll([5, 5, 5, 5, 5, 4, 4, 4]);
      await expect(providerRating(db(), booking.providerId)).resolves.toEqual({
        avg_rating: 4.63,
        rating_count: 8,
      });
    });

    it('replaces a stale stored average rather than adding to it', async () => {
      await db()
        .updateTable('providers')
        .set({ avg_rating: 1.5, rating_count: 40 })
        .where('id', '=', booking.providerId)
        .execute();

      await rateAll([2, 3]);

      await expect(providerRating(db(), booking.providerId)).resolves.toEqual({
        avg_rating: 2.5,
        rating_count: 2,
      });
    });

    it('leaves every other facility as it was', async () => {
      const other = await insertBooking(db(), 'completed');
      await db()
        .updateTable('providers')
        .set({ avg_rating: 3.75, rating_count: 4 })
        .where('id', '=', other.providerId)
        .execute();

      await rateAll([1, 2]);

      await expect(providerRating(db(), other.providerId)).resolves.toEqual({
        avg_rating: 3.75,
        rating_count: 4,
      });
      await expect(providerRating(db(), booking.providerId)).resolves.toEqual({
        avg_rating: 1.5,
        rating_count: 2,
      });
    });
  });
});

// Commits, since each request only waits on a provider lock held by another connection and only
// sees the other's rating once it is committed. The rows are deleted afterwards (decision 53).
describe.skipIf(noTestDatabase)('POST /bookings/:id/rating sent twice at once', () => {
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
    throw new Error(`${count} ratings never waited on the provider lock`);
  }

  /** Sends every request while the facility's row is locked, so all reach the lock first. */
  async function sendTogether(
    providerId: string,
    send: () => Promise<request.Response>[],
  ): Promise<number[]> {
    const db = database();
    const holder = await db.startTransaction().execute();
    let responses: Promise<request.Response[]> = Promise.resolve([]);
    try {
      await lockProvider(holder, providerId);
      const requests = send();
      responses = Promise.all(requests);
      await waitForLockWaits(requests.length);
      await holder.commit().execute();
    } catch (error) {
      await holder.rollback().execute();
      throw error;
    }
    return (await responses).map((response) => response.status).toSorted((a, b) => a - b);
  }

  it('lets exactly one of two ratings of one booking through, and the other is a 409', async () => {
    const db = database();
    const booking = await insertBooking(db, 'completed');
    try {
      const auth = await bearer(db, booking.farmerId);

      const statuses = await sendTogether(booking.providerId, () => [
        rate(db, booking.bookingId, auth, { stars: 5 }).then((response) => response),
        rate(db, booking.bookingId, auth, { stars: 1 }).then((response) => response),
      ]);

      expect(statuses).toEqual([201, 409]);
      await expect(ratingRows(db, booking.providerId)).resolves.toHaveLength(1);
      await expect(providerRating(db, booking.providerId)).resolves.toMatchObject({
        rating_count: 1,
      });
    } finally {
      await deleteBooking(db, booking);
    }
  });

  it('counts both of two ratings of one facility sent at once', async () => {
    const db = database();
    const booking = await insertBooking(db, 'completed');
    try {
      const second = await insertBookingFor(db, booking, 'completed');
      const auth = await bearer(db, booking.farmerId);

      const statuses = await sendTogether(booking.providerId, () => [
        rate(db, booking.bookingId, auth, { stars: 5 }).then((response) => response),
        rate(db, second, auth, { stars: 2 }).then((response) => response),
      ]);

      expect(statuses).toEqual([201, 201]);
      await expect(providerRating(db, booking.providerId)).resolves.toEqual({
        avg_rating: 3.5,
        rating_count: 2,
      });
    } finally {
      await deleteBooking(db, booking);
    }
  });
});
