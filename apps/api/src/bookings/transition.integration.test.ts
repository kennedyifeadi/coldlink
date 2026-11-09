import { randomUUID } from 'node:crypto';
import type { BookingEventActorType, BookingStatus } from '@coldlink/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { deleteBooking, insertBooking, type BookingFixture } from '../test/bookings.js';
import { captureLogs } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';
import { createTransitionHooks } from './hooks.js';
import {
  BookingNotFoundError,
  BookingTransitionError,
  runBookingTransition,
  transitionBooking,
  type BookingActor,
} from './transition.js';

const allowed: [BookingStatus, BookingStatus, BookingEventActorType][] = [
  ['payment_pending', 'pending_provider', 'system'],
  ['payment_pending', 'expired', 'system'],
  ['pending_provider', 'confirmed', 'provider'],
  ['pending_provider', 'confirmed', 'admin'],
  ['pending_provider', 'rejected', 'provider'],
  ['pending_provider', 'rejected', 'admin'],
  ['pending_provider', 'expired', 'system'],
  ['pending_provider', 'cancelled', 'farmer'],
  ['confirmed', 'in_storage', 'provider'],
  ['confirmed', 'cancelled', 'farmer'],
  ['confirmed', 'cancelled', 'provider'],
  ['confirmed', 'cancelled', 'admin'],
  ['confirmed', 'no_show', 'system'],
  ['confirmed', 'no_show', 'admin'],
  ['in_storage', 'completed', 'provider'],
];

function actorFor(type: BookingEventActorType, fixture: BookingFixture): BookingActor {
  switch (type) {
    case 'system':
      return { type };
    case 'farmer':
      return { type, id: fixture.farmerId };
    case 'provider':
      return { type, id: fixture.providerId };
    default:
      return { type, id: randomUUID() };
  }
}

function bookingRow(db: Database, id: string) {
  return db.selectFrom('bookings').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

function eventRows(db: Database, bookingId: string) {
  return db.selectFrom('booking_events').selectAll().where('booking_id', '=', bookingId).execute();
}

describe.skipIf(noTestDatabase)('transitionBooking against Postgres', () => {
  const db = useTestTransaction();
  const hooks = createTransitionHooks();

  it.each(allowed)('moves %s → %s by %s and logs one event', async (from, to, actorType) => {
    const fixture = await insertBooking(db(), from);
    const actor = actorFor(actorType, fixture);

    const { transition } = await transitionBooking(db(), hooks, {
      bookingId: fixture.bookingId,
      to,
      actor,
      reason: 'Test reason',
      metadata: { source: 'test' },
    });

    const booking = await bookingRow(db(), fixture.bookingId);
    expect(booking.status).toBe(to);
    expect(booking.cancelled_by).toBe(to === 'cancelled' ? actorType : null);
    expect(booking.cancel_reason).toBe(to === 'cancelled' ? 'Test reason' : null);
    expect(booking.checked_in_at === null).toBe(to !== 'in_storage');
    expect(booking.collected_at === null).toBe(to !== 'completed');

    const events = await eventRows(db(), fixture.bookingId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: transition.eventId,
      from_status: from,
      to_status: to,
      actor_type: actorType,
      actor_id: actor.id ?? null,
      metadata: { source: 'test', reason: 'Test reason' },
    });
    expect(transition).toMatchObject({ bookingId: fixture.bookingId, from, to, actor });
  });

  it('leaves the cancel reason empty when none is given', async () => {
    const fixture = await insertBooking(db(), 'confirmed');
    await transitionBooking(db(), hooks, {
      bookingId: fixture.bookingId,
      to: 'cancelled',
      actor: { type: 'provider', id: fixture.providerId },
    });

    expect(await bookingRow(db(), fixture.bookingId)).toMatchObject({
      status: 'cancelled',
      cancelled_by: 'provider',
      cancel_reason: null,
    });
    const [event] = await eventRows(db(), fixture.bookingId);
    expect(event?.metadata).toEqual({});
  });

  it.each<[BookingStatus, BookingStatus, BookingEventActorType, string]>([
    ['payment_pending', 'confirmed', 'admin', 'not_a_transition'],
    ['completed', 'cancelled', 'admin', 'not_a_transition'],
    ['confirmed', 'confirmed', 'provider', 'not_a_transition'],
    ['pending_provider', 'confirmed', 'farmer', 'actor_not_allowed'],
    ['confirmed', 'in_storage', 'admin', 'actor_not_allowed'],
    ['confirmed', 'cancelled', 'system', 'actor_not_allowed'],
  ])('refuses %s → %s by %s and changes nothing', async (from, to, actorType, reason) => {
    const fixture = await insertBooking(db(), from);
    const before = await bookingRow(db(), fixture.bookingId);

    const refused = transitionBooking(db(), hooks, {
      bookingId: fixture.bookingId,
      to,
      actor: actorFor(actorType, fixture),
    });

    await expect(refused).rejects.toBeInstanceOf(BookingTransitionError);
    await expect(refused).rejects.toMatchObject({ reason, code: 'conflict', status: 409 });
    expect(await bookingRow(db(), fixture.bookingId)).toEqual(before);
    expect(await eventRows(db(), fixture.bookingId)).toEqual([]);
  });

  it('refuses a booking that does not exist', async () => {
    const refused = transitionBooking(db(), hooks, {
      bookingId: randomUUID(),
      to: 'confirmed',
      actor: { type: 'admin', id: randomUUID() },
    });
    await expect(refused).rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(refused).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('runs matching in-transaction hooks on the same transaction', async () => {
    const fixture = await insertBooking(db(), 'confirmed');
    const seen: string[] = [];
    const checkInHooks = createTransitionHooks();
    checkInHooks.inTransaction({
      name: 'read_check_in',
      on: { to: 'in_storage' },
      run: async (trx, transition) => {
        const booking = await bookingRow(trx, transition.bookingId);
        seen.push(booking.status);
      },
    });
    checkInHooks.inTransaction({
      name: 'never_runs',
      on: { to: 'completed' },
      run: () => Promise.reject(new Error('Should not run')),
    });

    await transitionBooking(db(), checkInHooks, {
      bookingId: fixture.bookingId,
      to: 'in_storage',
      actor: { type: 'provider', id: fixture.providerId },
    });
    expect(seen).toEqual(['in_storage']);
  });

  it('leaves no change and no event when an in-transaction hook throws and the caller rolls back', async () => {
    const fixture = await insertBooking(db(), 'confirmed');
    const failing = createTransitionHooks();
    failing.inTransaction({
      name: 'create_payout',
      on: { to: 'in_storage' },
      run: () => Promise.reject(new Error('Payout insert failed')),
    });

    const savepoint = await db().savepoint('transition').execute();
    await expect(
      transitionBooking(savepoint, failing, {
        bookingId: fixture.bookingId,
        to: 'in_storage',
        actor: { type: 'provider', id: fixture.providerId },
      }),
    ).rejects.toThrow('Payout insert failed');
    await savepoint.rollbackToSavepoint('transition').execute();

    expect(await bookingRow(db(), fixture.bookingId)).toMatchObject({
      status: 'confirmed',
      checked_in_at: null,
    });
    expect(await eventRows(db(), fixture.bookingId)).toEqual([]);
  });
});

// These commit, since only committed rows are visible to the check after the commit and to a
// second connection waiting on the row lock. Each deletes its fixture afterwards.
describe.skipIf(noTestDatabase)('runBookingTransition across commits', () => {
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

  async function withCommittedBooking(
    status: BookingStatus,
    test: (fixture: BookingFixture) => Promise<void>,
  ): Promise<void> {
    const fixture = await insertBooking(database(), status);
    try {
      await test(fixture);
    } finally {
      await deleteBooking(database(), fixture);
    }
  }

  it('runs after-commit hooks once the change is visible to other connections', async () => {
    await withCommittedBooking('pending_provider', async (fixture) => {
      const hooks = createTransitionHooks();
      const seenStatuses: string[] = [];
      hooks.afterCommit({
        name: 'read_from_pool',
        on: { to: 'confirmed' },
        run: async ({ bookingId }) => {
          seenStatuses.push((await bookingRow(database(), bookingId)).status);
        },
      });

      const transition = await runBookingTransition(
        { db: database(), hooks, logger: captureLogs().logger },
        {
          bookingId: fixture.bookingId,
          to: 'confirmed',
          actor: { type: 'provider', id: fixture.providerId },
        },
      );

      expect(transition.to).toBe('confirmed');
      expect(seenStatuses).toEqual(['confirmed']);
    });
  });

  it('runs no after-commit hook when the transition rolls back', async () => {
    await withCommittedBooking('confirmed', async (fixture) => {
      const hooks = createTransitionHooks();
      const afterCommit = vi.fn<() => Promise<void>>(() => Promise.resolve());
      hooks.inTransaction({
        name: 'create_payout',
        on: { to: 'in_storage' },
        run: () => Promise.reject(new Error('Payout insert failed')),
      });
      hooks.afterCommit({ name: 'notify', on: {}, run: afterCommit });

      await expect(
        runBookingTransition(
          { db: database(), hooks, logger: captureLogs().logger },
          {
            bookingId: fixture.bookingId,
            to: 'in_storage',
            actor: { type: 'provider', id: fixture.providerId },
          },
        ),
      ).rejects.toThrow('Payout insert failed');

      expect(afterCommit).not.toHaveBeenCalled();
      expect((await bookingRow(database(), fixture.bookingId)).status).toBe('confirmed');
      expect(await eventRows(database(), fixture.bookingId)).toEqual([]);
    });
  });

  it('keeps the transition when an after-commit hook fails, and logs it', async () => {
    await withCommittedBooking('pending_provider', async (fixture) => {
      const hooks = createTransitionHooks();
      const later = vi.fn<() => Promise<void>>(() => Promise.resolve());
      hooks.afterCommit({
        name: 'refund',
        on: { to: 'rejected' },
        run: () => Promise.reject(new Error('Paystack is down')),
      });
      hooks.afterCommit({ name: 'notify', on: { to: 'rejected' }, run: later });
      const logs = captureLogs();

      await runBookingTransition(
        { db: database(), hooks, logger: logs.logger },
        {
          bookingId: fixture.bookingId,
          to: 'rejected',
          actor: { type: 'provider', id: fixture.providerId },
        },
      );

      expect(later).toHaveBeenCalledOnce();
      expect((await bookingRow(database(), fixture.bookingId)).status).toBe('rejected');
      expect(await eventRows(database(), fixture.bookingId)).toHaveLength(1);
      expect(logs.output()).toContain('Booking after-commit hook failed');
      expect(logs.output()).toContain('"hook":"refund"');
    });
  });

  async function waitForLockWait(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await sql<{ waiting: number }>`
        select count(*)::int as waiting from pg_catalog.pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `.execute(database());
      if ((rows[0]?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('The second transition never waited on the row lock');
  }

  it('makes a second, concurrent transition wait for the first and then refuses it', async () => {
    await withCommittedBooking('pending_provider', async (fixture) => {
      const hooks = createTransitionHooks();
      const provider: BookingActor = { type: 'provider', id: fixture.providerId };
      const first = await database().startTransaction().execute();
      let second: Promise<unknown> = Promise.resolve();
      try {
        await transitionBooking(first, hooks, {
          bookingId: fixture.bookingId,
          to: 'confirmed',
          actor: provider,
        });
        second = runBookingTransition(
          { db: database(), hooks, logger: captureLogs().logger },
          { bookingId: fixture.bookingId, to: 'rejected', actor: provider },
        ).then(
          () => 'committed',
          (error: unknown) => error,
        );
        await waitForLockWait();
        await first.commit().execute();
      } catch (error) {
        await first.rollback().execute();
        throw error;
      }

      const outcome = await second;
      expect(outcome).toBeInstanceOf(BookingTransitionError);
      expect(outcome).toMatchObject({
        reason: 'not_a_transition',
        from: 'confirmed',
        to: 'rejected',
      });
      expect((await bookingRow(database(), fixture.bookingId)).status).toBe('confirmed');
      const events = await eventRows(database(), fixture.bookingId);
      expect(events.map((event) => event.to_status)).toEqual(['confirmed']);
    });
  });
});
