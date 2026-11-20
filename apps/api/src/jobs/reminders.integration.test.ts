import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { jobServices, notificationsFor } from '../test/jobs.js';
import { bookingRow, setStatus } from '../test/providerActions.js';

// insertBooking's booking runs from 1 December to its end date, 31 December 2026.
/** An instant on the Lagos clock, which is UTC+1. */
const lagos = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);
const TWO_DAYS_BEFORE = lagos('2026-12-29', '08:00');
const DAY_BEFORE = lagos('2026-12-30', '08:00');
const LAST_DAY = lagos('2026-12-31', '08:00');
const NONE = { expiry_two_days_before: 0, expiry_last_day: 0, collection_due: 0 };

describe.skipIf(noTestDatabase)('reminders job', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let phones: { farmer: string; provider: string };

  beforeEach(async () => {
    booking = await insertBooking(db(), 'in_storage');
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

  const run = (now: Date) => {
    const services = jobServices(db(), () => now);
    return { services, counts: services.job('reminders').run() };
  };

  function reminders() {
    return db()
      .selectFrom('booking_reminders')
      .select(['kind', 'notification_id'])
      .where('booking_id', '=', booking.bookingId)
      .orderBy('kind')
      .execute();
  }

  const notifications = () => notificationsFor(db(), [booking.farmerId, booking.ownerId]);

  it('texts the farmer two days before the end date, and records it', async () => {
    const { services, counts } = run(TWO_DAYS_BEFORE);
    await expect(counts).resolves.toEqual({ ...NONE, expiry_two_days_before: 1 });

    const { code } = await bookingRow(db(), booking.bookingId);
    const [notification, ...others] = await notifications();
    expect(others).toEqual([]);
    expect(notification).toMatchObject({
      template: 'expiry_reminder',
      recipient_phone: phones.farmer,
      user_id: booking.farmerId,
      status: 'sent',
      payload: {
        code,
        facility_name: 'Booking test cold room',
        end_date: '2026-12-31',
        kind: 'expiry_two_days_before',
      },
    });
    expect(await reminders()).toEqual([
      { kind: 'expiry_two_days_before', notification_id: notification?.id },
    ]);
    expect(services.sms.sent).toEqual([
      {
        to: phones.farmer,
        template: 'expiry_reminder',
        text:
          `ColdLink: your booking ${code} at Booking test cold room ends on 31 Dec 2026. ` +
          'Please collect your produce by then.',
      },
    ]);
  });

  it('sends nothing more on a second run, that hour or the next day', async () => {
    await run(TWO_DAYS_BEFORE).counts;
    const again = run(TWO_DAYS_BEFORE);
    await expect(again.counts).resolves.toEqual(NONE);
    const nextDay = run(DAY_BEFORE);
    await expect(nextDay.counts).resolves.toEqual(NONE);

    expect(again.services.sms.sent).toEqual([]);
    expect(nextDay.services.sms.sent).toEqual([]);
    expect(await notifications()).toHaveLength(1);
    expect(await reminders()).toHaveLength(1);
  });

  it('catches up the two-day reminder the day before the end date', async () => {
    await expect(run(DAY_BEFORE).counts).resolves.toEqual({ ...NONE, expiry_two_days_before: 1 });
  });

  it('on the end date texts the farmer the last day and the provider the collection', async () => {
    await run(TWO_DAYS_BEFORE).counts;
    const { services, counts } = run(LAST_DAY);
    await expect(counts).resolves.toEqual({ ...NONE, expiry_last_day: 1, collection_due: 1 });

    const { code } = await bookingRow(db(), booking.bookingId);
    expect(services.sms.sent.toSorted((a, b) => a.template.localeCompare(b.template))).toEqual([
      {
        to: phones.provider,
        template: 'collection_reminder',
        text:
          `ColdLink: the produce for booking ${code} at Booking test cold room is due for ` +
          'collection today, 31 Dec 2026.',
      },
      {
        to: phones.farmer,
        template: 'expiry_reminder',
        text:
          `ColdLink: your booking ${code} at Booking test cold room ends today, 31 Dec 2026. ` +
          'Please collect your produce today.',
      },
    ]);
    expect(await notifications()).toContainEqual(
      expect.objectContaining({ template: 'collection_reminder', user_id: booking.ownerId }),
    );
    expect((await reminders()).map((row) => row.kind)).toEqual([
      'collection_due',
      'expiry_last_day',
      'expiry_two_days_before',
    ]);
  });

  it('never gives either party the other one’s phone', async () => {
    await run(TWO_DAYS_BEFORE).counts;
    const { services, counts } = run(LAST_DAY);
    await counts;
    const local = (phone: string) => phone.slice(4);
    for (const message of services.sms.sent) {
      const other = message.to === phones.farmer ? phones.provider : phones.farmer;
      expect(message.text).not.toContain(local(other));
    }
  });

  it('waits for the window: nothing at 7:59 AM in Lagos, sent from 8 AM', async () => {
    await expect(run(lagos('2026-12-29', '07:59')).counts).resolves.toEqual(NONE);
    await expect(run(lagos('2026-12-29', '08:00')).counts).resolves.toEqual({
      ...NONE,
      expiry_two_days_before: 1,
    });
  });

  it('sends nothing from 8 PM in Lagos, even on the end date', async () => {
    await expect(run(lagos('2026-12-31', '20:00')).counts).resolves.toEqual(NONE);
    await expect(run(lagos('2026-12-31', '19:59')).counts).resolves.toEqual({
      ...NONE,
      expiry_last_day: 1,
      collection_due: 1,
    });
  });

  // The Lagos and UTC dates differ only from 00:00 to 01:00 in Lagos, which is outside the window;
  // remindersDue's unit tests cover the day itself.
  it('sends nothing just after Lagos midnight on a day a reminder is due', async () => {
    await expect(run(new Date('2026-12-28T23:30:00Z')).counts).resolves.toEqual(NONE);
    await expect(run(lagos('2026-12-28', '19:59')).counts).resolves.toEqual(NONE);
  });

  it('skips the two-day reminder for a booking that started within two days of its end', async () => {
    // One day, 30 to 31 December, priced as insertBooking prices a day.
    await db()
      .updateTable('bookings')
      .set({
        start_date: '2026-12-30',
        duration_days: 1,
        storage_subtotal_kobo: 451_600,
        commission_kobo: 33_870,
        deposit_kobo: 135_480,
        balance_due_kobo: 316_120,
        total_charged_online_kobo: 135_480,
      })
      .where('id', '=', booking.bookingId)
      .execute();

    await expect(run(DAY_BEFORE).counts).resolves.toEqual(NONE);
    await expect(run(LAST_DAY).counts).resolves.toEqual({
      ...NONE,
      expiry_last_day: 1,
      collection_due: 1,
    });
  });

  it('sends nothing for a booking that is not in storage', async () => {
    await setStatus(db(), booking.bookingId, 'confirmed');
    await expect(run(TWO_DAYS_BEFORE).counts).resolves.toEqual(NONE);
    await setStatus(db(), booking.bookingId, 'completed');
    await expect(run(LAST_DAY).counts).resolves.toEqual(NONE);
    expect(await reminders()).toEqual([]);
  });
});
