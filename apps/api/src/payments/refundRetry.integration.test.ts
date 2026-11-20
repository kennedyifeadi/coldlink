import { beforeEach, describe, expect, it } from 'vitest';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { jobServices } from '../test/jobs.js';
import { insertCharge, paymentRows } from '../test/payments.js';
import { refundBooking } from './refunds.js';
import { MAX_REFUND_RETRIES, retryFailedRefunds } from './refundRetry.js';

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
  });

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

  const retry = (services: ReturnType<typeof jobServices>) =>
    retryFailedRefunds({
      db: db(),
      gateway: services.payments.gateway,
      logger: services.logs.logger,
    });

  async function rows() {
    const all = await paymentRows(db(), booking.bookingId);
    return {
      charge: all.find((row) => row.purpose === 'booking_deposit'),
      refunds: all.filter((row) => row.purpose === 'refund'),
    };
  }

  it('resends a refund Paystack never made, on the same row', async () => {
    const services = jobServices(db());
    services.payments.state.failRefunds = true;
    await failFirstAttempt(services);

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
