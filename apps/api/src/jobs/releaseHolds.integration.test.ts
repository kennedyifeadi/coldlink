import { beforeEach, describe, expect, it } from 'vitest';
import { createAppConfigReader } from '../appConfig.js';
import { settleCharge } from '../payments/charges.js';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import { testConfig } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { eventsOf, jobServices, notificationsFor, setDeadline } from '../test/jobs.js';
import { insertCharge, paymentRows } from '../test/payments.js';
import { bookingRow } from '../test/providerActions.js';
import { releaseHolds } from './releaseHolds.js';

// insertBooking's PRD 6.1 worked example: everything paid online is the deposit.
const TOTAL = 4_064_400;

describe.skipIf(noTestDatabase)('release holds job', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'payment_pending');
  });

  it('expires a hold at payment_expires_at itself, as the system, texting nobody', async () => {
    const { deps, sms, payments } = jobServices(db());
    await setDeadline(db(), booking.bookingId, 'payment_expires_at', 0);

    await expect(releaseHolds(deps)).resolves.toEqual({ expired: 1, failed: 0 });
    expect((await bookingRow(db(), booking.bookingId)).status).toBe('expired');
    expect(await eventsOf(db(), booking.bookingId)).toEqual([
      {
        from_status: 'payment_pending',
        to_status: 'expired',
        actor_type: 'system',
        actor_id: null,
        metadata: { reason: 'payment_hold_lapsed' },
      },
    ]);
    expect(sms.sent).toEqual([]);
    expect(await notificationsFor(db(), [booking.farmerId, booking.ownerId])).toEqual([]);
    expect(payments.refunds).toEqual([]);
  });

  it('leaves a hold that has a second to run', async () => {
    const { deps } = jobServices(db());
    await setDeadline(db(), booking.bookingId, 'payment_expires_at', 1);

    await expect(releaseHolds(deps)).resolves.toEqual({ expired: 0, failed: 0 });
    expect((await bookingRow(db(), booking.bookingId)).status).toBe('payment_pending');
  });

  it('changes nothing on a second run', async () => {
    const { deps } = jobServices(db());
    await setDeadline(db(), booking.bookingId, 'payment_expires_at', -60);

    await releaseHolds(deps);
    await expect(releaseHolds(deps)).resolves.toEqual({ expired: 0, failed: 0 });
    expect(await eventsOf(db(), booking.bookingId)).toHaveLength(1);
  });

  describe('with a payment for the hold (decision 94)', () => {
    async function pay(services: ReturnType<typeof jobServices>, reference: string) {
      services.payments.pay(reference, TOTAL);
      const charge = services.payments.charges.get(reference);
      if (charge === undefined) throw new Error('No charge');
      const settled = await settleCharge(
        {
          db: db(),
          gateway: services.payments.gateway,
          appConfig: createAppConfigReader(db()),
          hooks: services.services.hooks,
          config: testConfig,
          logger: services.logs.logger,
        },
        charge,
      );
      await settled.afterCommit();
      return settled.outcome;
    }

    it('refunds a payment that lands after the job expired the hold', async () => {
      const services = jobServices(db());
      const reference = await insertCharge(db(), {
        bookingId: booking.bookingId,
        status: 'initiated',
        amountKobo: TOTAL,
      });
      await setDeadline(db(), booking.bookingId, 'payment_expires_at', -60);
      await releaseHolds(services.deps);

      await expect(pay(services, reference)).resolves.toMatchObject({
        kind: 'late',
        bookingStatus: 'expired',
      });
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('expired');
      expect(services.payments.refunds).toEqual([
        { chargeReference: reference, amountKobo: TOTAL },
      ]);
      expect(await paymentRows(db(), booking.bookingId)).toContainEqual(
        expect.objectContaining({ purpose: 'refund', status: 'success' }),
      );
    });

    it('leaves alone a lapsed hold that was paid before the job reached it', async () => {
      const services = jobServices(db());
      const reference = await insertCharge(db(), {
        bookingId: booking.bookingId,
        status: 'initiated',
        amountKobo: TOTAL,
      });
      await setDeadline(db(), booking.bookingId, 'payment_expires_at', -60);
      await expect(pay(services, reference)).resolves.toMatchObject({ kind: 'confirmed' });

      await expect(releaseHolds(services.deps)).resolves.toEqual({ expired: 0, failed: 0 });
      expect((await bookingRow(db(), booking.bookingId)).status).toBe('pending_provider');
      expect(services.payments.refunds).toEqual([]);
    });
  });
});
