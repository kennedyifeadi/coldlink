import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { jobServices, makeNotificationsDue, notificationsFor, setDeadline } from '../test/jobs.js';
import { bookingRow } from '../test/providerActions.js';

describe.skipIf(noTestDatabase)('SMS queue job', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let phones: { farmer: string; provider: string };

  beforeEach(async () => {
    booking = await insertBooking(db(), 'pending_provider');
    await setDeadline(db(), booking.bookingId, 'provider_response_due_at', 3_600);
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

  // What the booking hooks would have logged before a send that never finished.
  async function queueBookingMessages(services: ReturnType<typeof jobServices>) {
    const row = await bookingRow(db(), booking.bookingId);
    const responseDueAt = row.provider_response_due_at?.toISOString() ?? '';
    const { store } = services.services.notifications;
    await store.insert({
      userId: booking.farmerId,
      recipientPhone: phones.farmer,
      template: 'booking_paid',
      payload: {
        code: row.code,
        facility_name: 'Booking test cold room',
        response_due_at: responseDueAt,
      },
    });
    await store.insert({
      userId: booking.ownerId,
      recipientPhone: phones.provider,
      template: 'booking_received',
      payload: {
        booking_id: booking.bookingId,
        code: row.code,
        facility_name: 'Booking test cold room',
        crop_name: 'Tomatoes',
        quantity: 2,
        capacity_unit: 'sqm',
        start_date: '2026-12-01',
        end_date: '2026-12-31',
        payout_kobo: 3_048_300,
        response_due_at: responseDueAt,
      },
    });
    await makeNotificationsDue(db(), [booking.farmerId, booking.ownerId]);
  }

  it('sends every due message with the shared templates, a link included', async () => {
    const services = jobServices(db());
    await queueBookingMessages(services);

    await expect(services.job('sms_queue').run()).resolves.toEqual({
      queued: 0,
      sent: 2,
      failed: 0,
    });
    expect(services.sms.sent.map((message) => message.template).toSorted()).toEqual([
      'booking_paid',
      'booking_received',
    ]);
    const received = services.sms.sent.find((message) => message.template === 'booking_received');
    expect(received?.text).toContain(`${testConfig.webAppUrl}/a/`);
  });

  it('sends nothing more on a second run', async () => {
    const services = jobServices(db());
    await queueBookingMessages(services);

    await services.job('sms_queue').run();
    await makeNotificationsDue(db(), [booking.farmerId, booking.ownerId]);
    await expect(services.job('sms_queue').run()).resolves.toEqual({
      queued: 0,
      sent: 0,
      failed: 0,
    });
    expect(services.sms.sent).toHaveLength(2);
    expect(
      (await notificationsFor(db(), [booking.farmerId, booking.ownerId])).map((row) => row.status),
    ).toEqual(['sent', 'sent']);
  });
});
