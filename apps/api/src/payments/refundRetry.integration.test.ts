import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { jobServices } from '../test/jobs.js';
import { insertCharge, paymentRows } from '../test/payments.js';
import { refundBooking } from './refunds.js';
import { MAX_REFUND_RETRIES, retryFailedRefunds } from './refundRetry.js';
import { mergePayload } from './store.js';

// insertBooking's PRD 6.1 worked example: everything paid online is the deposit.
const TOTAL = 4_064_400;
const NOTHING = { refunded: 0, found: 0, failed: 0, needs_attention: 0 };

describe.skipIf(noTestDatabase)('refund retry', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let reference: string;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'rejected');
    reference = await insertCharge(db(), {
      bookingId: booking.bookingId,
      status: 'success',
      amountKobo: TOTAL,
    });
    // As confirmCharge stores it.
    await db()
      .updateTable('payments')
      .set({ paystack_payload: mergePayload({ charge: { id: '4099260516' } }) })
      .where('provider_ref', '=', reference)
      .execute();
  });

  // payments_set_updated_at would overwrite the backdated value; the disable rolls back with the
  // test's transaction.
  async function letRefundSettle() {
    await sql`alter table public.payments disable trigger payments_set_updated_at`.execute(db());
    await db()
      .updateTable('payments')
      .set({ updated_at: sql<Date>`now() - interval '2 minutes'` })
      .where('booking_id', '=', booking.bookingId)
      .execute();
    await sql`alter table public.payments enable trigger payments_set_updated_at`.execute(db());
  }

  /** The refund hook's own attempt, which fails as `state` says. */
  async function failFirstAttempt(services: ReturnType<typeof jobServices>) {
    await expect(
      refundBooking(
        { db: db(), gateway: services.payments.gateway, logger: services.logs.logger },
        { bookingId: booking.bookingId, amount: 'full', reason: 'rejected' },
      ),
    ).resolves.toBe('failed');
    services.payments.state.failRefunds = false;
    services.payments.state.loseRefundResponses = false;
  }

  async function retry(services: ReturnType<typeof jobServices>) {
    await letRefundSettle();
    return retryFailedRefunds({
      db: db(),
      gateway: services.payments.gateway,
      logger: services.logs.logger,
    });
  }

  async function rows() {
    const all = await paymentRows(db(), booking.bookingId);
    return {
      charge: all.find((row) => row.purpose === 'booking_deposit'),
      refunds: all.filter((row) => row.purpose === 'refund'),
    };
  }

  async function insertPaidDelivery(feeKobo: number): Promise<string> {
    const point = sql<string>`extensions.st_setsrid(extensions.st_makepoint(3.9, 7.4), 4326)::extensions.geography`;
    const { id } = await db()
      .insertInto('delivery_requests')
      .values({
        context_type: 'booking_inbound',
        context_id: booking.bookingId,
        requested_by: booking.farmerId,
        pickup_text: 'Farm',
        pickup_location: point,
        dropoff_text: 'Facility',
        dropoff_location: point,
        contact_phone: '+2348009000002',
        load_description: 'Crates',
        load_quantity: 5,
        load_unit: 'crates',
        distance_km: 0,
        vehicle_type: 'bike',
        fee_kobo: feeKobo,
        partner_payout_kobo: 0,
        platform_margin_kobo: feeKobo,
        status: 'cancelled',
        handover_code: '0427',
        paid_at: sql<Date>`now()`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return id;
  }

  it("never takes a delivery's refund on the same charge for the booking's", async () => {
    const services = jobServices(db());
    const deps = { db: db(), gateway: services.payments.gateway, logger: services.logs.logger };
    const fee = 245_000;
    const deliveryRequestId = await insertPaidDelivery(fee);
    await expect(
      refundBooking(deps, {
        bookingId: booking.bookingId,
        deliveryRequestId,
        amount: fee,
        reason: 'delivery_cancelled',
      }),
    ).resolves.toBe('refunded');
    services.payments.state.failRefunds = true;
    await expect(
      refundBooking(deps, {
        bookingId: booking.bookingId,
        amount: TOTAL - fee,
        reason: 'rejected',
      }),
    ).resolves.toBe('failed');
    services.payments.state.failRefunds = false;

    await expect(retry(services)).resolves.toEqual({ ...NOTHING, refunded: 1 });

    const { charge, refunds } = await rows();
    const summary = refunds.map((row) => [
      row.delivery_request_id,
      row.amount_kobo,
      row.status,
      (row.paystack_payload as Record<string, unknown>).paystack_refund_id,
    ]);
    expect(summary).toEqual(
      expect.arrayContaining([
        [deliveryRequestId, fee, 'success', 'refund-1'],
        [null, TOTAL - fee, 'success', 'refund-2'],
      ]),
    );
    expect(summary).toHaveLength(2);
    expect(charge?.status).toBe('refunded');
  });

  it('resends a refund Paystack never made, on the same row', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);

    await letRefundSettle();
    await expect(services.job('refund_retry').run()).resolves.toEqual({
      ...NOTHING,
      refunded: 1,
    });
    const { charge, refunds } = await rows();
    expect(refunds).toEqual([
      expect.objectContaining({
        status: 'success',
        amount_kobo: TOTAL,
        paystack_payload: expect.objectContaining({
          paystack_refund_id: 'refund-1',
          charge_reference: reference,
        }) as unknown,
      }),
    ]);
    expect(refunds[0]?.paid_at).not.toBeNull();
    expect(charge?.status).toBe('refunded');
    expect(services.payments.held).toHaveLength(1);
  });

  it('records a refund the failed call made at Paystack without sending another', async () => {
    const services = jobServices(db());
    services.payments.state.loseRefundResponses = true;
    await failFirstAttempt(services);
    expect(services.payments.held).toHaveLength(1);

    await expect(retry(services)).resolves.toEqual({ ...NOTHING, found: 1 });
    expect(services.payments.refunds).toHaveLength(1);
    const { charge, refunds } = await rows();
    expect(refunds).toEqual([
      expect.objectContaining({
        status: 'success',
        paystack_payload: expect.objectContaining({
          paystack_refund_id: 'refund-1',
          paystack_status: 'pending',
        }) as unknown,
      }),
    ]);
    expect(charge?.status).toBe('refunded');
    expect(services.logs.output()).toContain('Refund found at Paystack and recorded');
  });

  it('resends when the only refund Paystack holds for the charge failed', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);
    services.payments.held.push({
      refundId: 'refund-old',
      status: 'failed',
      amountKobo: TOTAL,
      chargeReference: reference,
    });

    await expect(retry(services)).resolves.toEqual({ ...NOTHING, refunded: 1 });
    expect(services.payments.refunds).toHaveLength(2);
  });

  it('waits a minute, so a call that timed out can land before it is looked for', async () => {
    const services = jobServices(db());
    services.payments.state.loseRefundResponses = true;
    await failFirstAttempt(services);

    await expect(services.job('refund_retry').run()).resolves.toEqual(NOTHING);
    expect(services.payments.refunds).toHaveLength(1);
  });

  it('records a refund of another amount as made, and asks for attention', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);
    services.payments.held.push({
      refundId: 'refund-by-admin',
      status: 'processed',
      amountKobo: 100_000,
      chargeReference: reference,
    });

    await expect(retry(services)).resolves.toEqual({ ...NOTHING, needs_attention: 1 });
    expect(services.payments.refunds).toHaveLength(1);
    const { charge, refunds } = await rows();
    expect(refunds).toEqual([
      expect.objectContaining({
        status: 'success',
        amount_kobo: 100_000,
        paystack_payload: expect.objectContaining({
          paystack_refund_id: 'refund-by-admin',
          requested_amount_kobo: TOTAL,
        }) as unknown,
      }),
    ]);
    expect(charge?.status).toBe('partially_refunded');
    expect(services.logs.output()).toContain('Refund needs attention');
  });

  it('does not resend when the charge has no id to look its refunds up by', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);
    await db()
      .updateTable('payments')
      .set({ paystack_payload: mergePayload({ charge: {} }) })
      .where('provider_ref', '=', reference)
      .execute();

    await expect(retry(services)).resolves.toEqual({ ...NOTHING, failed: 1 });
    expect(services.payments.refunds).toHaveLength(1);
  });

  it('changes nothing on a second run', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);

    await retry(services);
    await expect(retry(services)).resolves.toEqual(NOTHING);
    expect(services.payments.refunds).toHaveLength(2);
    expect((await rows()).refunds).toHaveLength(1);
  });

  it('does not resend when Paystack cannot say whether it refunded', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);
    services.payments.state.failListRefunds = true;

    await expect(retry(services)).resolves.toEqual({ ...NOTHING, failed: 1 });
    expect(services.payments.refunds).toHaveLength(1);
    expect((await rows()).refunds).toEqual([
      expect.objectContaining({
        status: 'failed',
        paystack_payload: expect.objectContaining({
          retry_attempts: 1,
          error: 'Paystack list refunds returned HTTP 503',
        }) as unknown,
      }),
    ]);
  });

  it('stops at the cap and asks for attention once', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);
    services.payments.state.failRefunds = true;

    for (let run = 1; run < MAX_REFUND_RETRIES; run += 1) {
      await expect(retry(services)).resolves.toEqual({ ...NOTHING, failed: 1 });
    }
    await expect(retry(services)).resolves.toEqual({ ...NOTHING, needs_attention: 1 });
    await expect(retry(services)).resolves.toEqual(NOTHING);

    expect(services.payments.refunds).toHaveLength(1 + MAX_REFUND_RETRIES);
    const { charge, refunds } = await rows();
    expect(refunds).toEqual([
      expect.objectContaining({
        status: 'failed',
        paystack_payload: expect.objectContaining({
          retry_attempts: MAX_REFUND_RETRIES,
        }) as unknown,
      }),
    ]);
    expect(charge?.status).toBe('success');
    const alerts = services.logs.lines.filter((line) => line.includes('Refund needs attention'));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('"level":50');
    expect(alerts[0]).not.toContain(reference);
  });
});
