import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { eventsOf, jobServices, notificationsFor } from '../test/jobs.js';
import { insertCharge, paymentRows } from '../test/payments.js';
import { bookingRow, setStatus } from '../test/providerActions.js';
import { flagNoShowCandidates } from './noShowCandidates.js';

// insertBooking's booking starts on 1 December 2026. Lagos is UTC+1, so its start day there runs
// from 23:00 UTC on 30 November to 23:00 UTC on 1 December.
const START_DAY_BEGINS = new Date('2026-11-30T23:00:00Z');
const START_DAY_LAST_SECOND = new Date('2026-12-01T22:59:59Z');
const DAY_AFTER_START = new Date('2026-12-01T23:00:00Z');

describe.skipIf(noTestDatabase)('no-show candidates job', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'confirmed');
    await insertCharge(db(), { bookingId: booking.bookingId, status: 'success', amountKobo: 1 });
  });

  const flag = (now: Date) => flagNoShowCandidates({ db: db(), now: () => now });

  it('flags a confirmed booking once its whole start day has passed in Lagos', async () => {
    const { job, sms, payments } = jobServices(db(), () => DAY_AFTER_START);
    await expect(job('no_show_candidates').run()).resolves.toEqual({ flagged: 1 });

    const row = await bookingRow(db(), booking.bookingId);
    expect(row.no_show_flagged_at).toBeInstanceOf(Date);
    expect(row.status).toBe('confirmed');
    expect(await eventsOf(db(), booking.bookingId)).toEqual([]);
    expect(await notificationsFor(db(), [booking.farmerId, booking.ownerId])).toEqual([]);
    expect(sms.sent).toEqual([]);
    expect(payments.refunds).toEqual([]);
    expect((await paymentRows(db(), booking.bookingId)).map((payment) => payment.status)).toEqual([
      'success',
    ]);
  });

  it.each([
    ['as the start day begins in Lagos, still 30 November in UTC', START_DAY_BEGINS],
    ['in the last second of the start day in Lagos', START_DAY_LAST_SECOND],
  ])('leaves it unflagged %s', async (_case, now) => {
    await expect(flag(now)).resolves.toEqual({ flagged: 0 });
    expect((await bookingRow(db(), booking.bookingId)).no_show_flagged_at).toBeNull();
  });

  it('sets the flag only once', async () => {
    await flag(DAY_AFTER_START);
    const first = (await bookingRow(db(), booking.bookingId)).no_show_flagged_at;

    await expect(flag(new Date('2026-12-05T08:00:00Z'))).resolves.toEqual({ flagged: 0 });
    expect((await bookingRow(db(), booking.bookingId)).no_show_flagged_at).toEqual(first);
  });

  it.each(['in_storage', 'pending_provider', 'cancelled'] as const)(
    'does not flag a %s booking',
    async (status) => {
      await setStatus(db(), booking.bookingId, status);
      await expect(flag(DAY_AFTER_START)).resolves.toEqual({ flagged: 0 });
    },
  );

  it('flags every candidate across batches', async () => {
    const others = [await insertBooking(db(), 'confirmed'), await insertBooking(db(), 'confirmed')];
    await expect(
      flagNoShowCandidates({ db: db(), now: () => DAY_AFTER_START }, 2),
    ).resolves.toEqual({ flagged: 3 });
    for (const other of others) {
      expect((await bookingRow(db(), other.bookingId)).no_show_flagged_at).not.toBeNull();
    }
  });
});
