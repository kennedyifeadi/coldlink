import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { eventsOf, jobServices, notificationsFor, setDeadline } from '../test/jobs.js';
import { insertCharge, paymentRows } from '../test/payments.js';
import { bookingRow } from '../test/providerActions.js';
import { expireUnanswered } from './expireUnanswered.js';

// insertBooking's PRD 6.1 worked example: everything paid online is the deposit.
const TOTAL = 4_064_400;

describe.skipIf(noTestDatabase)('expire unanswered job', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let reference: string;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'pending_provider');
    reference = await insertCharge(db(), {
      bookingId: booking.bookingId,
      status: 'success',
      amountKobo: TOTAL,
    });
  });

  it('expires at provider_response_due_at itself, refunds in full and tells the farmer', async () => {
    const { deps, sms, payments } = jobServices(db());
    await setDeadline(db(), booking.bookingId, 'provider_response_due_at', 0);

    await expect(expireUnanswered(deps)).resolves.toEqual({ expired: 1, failed: 0 });
    const row = await bookingRow(db(), booking.bookingId);
    expect(row.status).toBe('expired');
    expect(await eventsOf(db(), booking.bookingId)).toEqual([
      expect.objectContaining({
        from_status: 'pending_provider',
        to_status: 'expired',
        actor_type: 'system',
      }),
    ]);
    expect(payments.refunds).toEqual([{ chargeReference: reference, amountKobo: TOTAL }]);
    expect(await paymentRows(db(), booking.bookingId)).toEqual([
      expect.objectContaining({ purpose: 'booking_deposit', status: 'refunded' }),
      expect.objectContaining({ purpose: 'refund', status: 'success', amount_kobo: TOTAL }),
    ]);
    expect(await notificationsFor(db(), [booking.farmerId, booking.ownerId])).toEqual([
      expect.objectContaining({
        template: 'booking_rejected',
        user_id: booking.farmerId,
        status: 'sent',
        payload: {
          code: row.code,
          facility_name: 'Booking test cold room',
          reason: 'expired',
          refund_kobo: TOTAL,
        },
      }),
    ]);
    expect(sms.sent).toHaveLength(1);
  });

  it('leaves a booking the provider still has a second to answer', async () => {
    const { deps, payments } = jobServices(db());
    await setDeadline(db(), booking.bookingId, 'provider_response_due_at', 1);

    await expect(expireUnanswered(deps)).resolves.toEqual({ expired: 0, failed: 0 });
    expect((await bookingRow(db(), booking.bookingId)).status).toBe('pending_provider');
    expect(payments.refunds).toEqual([]);
  });

  it('refunds and texts once however often it runs', async () => {
    const { deps, sms, payments } = jobServices(db());
    await setDeadline(db(), booking.bookingId, 'provider_response_due_at', -60);

    await expireUnanswered(deps);
    await expect(expireUnanswered(deps)).resolves.toEqual({ expired: 0, failed: 0 });
    expect(await eventsOf(db(), booking.bookingId)).toHaveLength(1);
    expect(payments.refunds).toHaveLength(1);
    expect(sms.sent).toHaveLength(1);
    expect(
      (await paymentRows(db(), booking.bookingId)).filter((row) => row.purpose === 'refund'),
    ).toHaveLength(1);
  });

  it('does not expire a booking that is not waiting for the provider', async () => {
    const { deps } = jobServices(db());
    await db()
      .updateTable('bookings')
      .set({ status: 'confirmed' })
      .where('id', '=', booking.bookingId)
      .execute();
    await setDeadline(db(), booking.bookingId, 'provider_response_due_at', -60);

    await expect(expireUnanswered(deps)).resolves.toEqual({ expired: 0, failed: 0 });
    expect((await bookingRow(db(), booking.bookingId)).status).toBe('confirmed');
  });
});
