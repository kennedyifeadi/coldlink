import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import {
  PaymentGatewayError,
  type ChargeRequest,
  type ExistingRefund,
  type GatewayCharge,
  type PaymentGateway,
  type RefundRequest,
} from '../payments/gateway.js';
import { paystackSignature } from '../payments/paystackGateway.js';
import { generatePaymentReference } from '../payments/store.js';

/** Signs fake webhooks. Not a Paystack key: tests never reach Paystack (decision 47). */
export const FAKE_PAYSTACK_SECRET = 'sk_test_fakewebhooksigningkey';

export function signWebhook(body: string): string {
  return paystackSignature(FAKE_PAYSTACK_SECRET, Buffer.from(body));
}

export function chargeSuccessEvent(charge: {
  reference: string;
  amount: number;
  currency?: string;
}) {
  return {
    event: 'charge.success',
    data: {
      id: 4_099_260_516,
      reference: charge.reference,
      status: 'success',
      amount: charge.amount,
      currency: charge.currency ?? 'NGN',
      channel: 'card',
      gateway_response: 'Successful',
      paid_at: '2026-11-10T08:05:00.000Z',
      customer: { email: 'farmer-1234567@example.com' },
      authorization: { authorization_code: 'AUTH_fake' },
    },
  };
}

/**
 * An in-memory gateway. `charges` is what verify answers, by reference, and `held` the refunds
 * Paystack has made, which listRefunds answers. A refund is refused before it is made while
 * `failRefunds` is set, and made but answered with a timeout while `loseRefundResponses` is, as
 * when Paystack's answer never arrives. Every refund call is recorded in `refunds`.
 */
export function fakePaymentGateway() {
  const charges = new Map<string, GatewayCharge>();
  const initialized: ChargeRequest[] = [];
  const refunds: RefundRequest[] = [];
  const held: (ExistingRefund & { chargeReference: string })[] = [];
  const state = {
    failRefunds: false,
    failInitialize: false,
    loseRefundResponses: false,
    failListRefunds: false,
  };
  let refundCount = 0;

  const gateway: PaymentGateway = {
    initialize(charge) {
      if (state.failInitialize) {
        return Promise.reject(new PaymentGatewayError('Paystack initialize returned HTTP 503'));
      }
      initialized.push(charge);
      return Promise.resolve({
        authorizationUrl: `https://checkout.paystack.test/${charge.reference}`,
        accessCode: `access-${initialized.length}`,
      });
    },
    verify(reference) {
      const charge = charges.get(reference);
      if (charge === undefined) {
        return Promise.reject(new PaymentGatewayError('Paystack verify returned HTTP 404'));
      }
      return Promise.resolve(charge);
    },
    refund(refund) {
      refunds.push(refund);
      if (state.failRefunds) {
        return Promise.reject(new PaymentGatewayError('Paystack refund returned HTTP 400'));
      }
      refundCount += 1;
      const made = { refundId: `refund-${refundCount}`, status: 'pending' };
      held.push({
        ...made,
        amountKobo: refund.amountKobo,
        chargeReference: refund.chargeReference,
      });
      if (state.loseRefundResponses) {
        return Promise.reject(new PaymentGatewayError('Paystack refund timed out after 10000 ms'));
      }
      return Promise.resolve(made);
    },
    listRefunds({ chargeReference }) {
      if (state.failListRefunds) {
        return Promise.reject(new PaymentGatewayError('Paystack list refunds returned HTTP 503'));
      }
      return Promise.resolve(
        held
          .filter((refund) => refund.chargeReference === chargeReference)
          .map(({ refundId, status, amountKobo }) => ({ refundId, status, amountKobo })),
      );
    },
    isSignedWebhook(rawBody, signature) {
      return signature === paystackSignature(FAKE_PAYSTACK_SECRET, rawBody);
    },
  };

  /** Makes verify report the charge with Paystack's `status`, such as `abandoned` or `ongoing`. */
  function report(reference: string, status: string, amountKobo: number, currency = 'NGN'): void {
    charges.set(reference, {
      reference,
      status,
      amountKobo,
      currency,
      record: { id: '4099260516', status, amount: amountKobo, currency },
    });
  }

  /** Makes verify report the charge as paid. */
  function pay(reference: string, amountKobo: number, currency = 'NGN'): void {
    report(reference, 'success', amountKobo, currency);
  }

  return { gateway, charges, initialized, refunds, held, state, pay, report };
}

export interface ChargeFixture {
  bookingId: string;
  status: 'initiated' | 'success';
  amountKobo: number;
}

/** A booking charge with a fresh reference, as `POST /payments/initialize` records one. */
export async function insertCharge(db: Database, charge: ChargeFixture): Promise<string> {
  const reference = generatePaymentReference('charge');
  await db
    .insertInto('payments')
    .values({
      booking_id: charge.bookingId,
      provider_ref: reference,
      purpose: 'booking_deposit',
      amount_kobo: charge.amountKobo,
      status: charge.status,
      paid_at: charge.status === 'success' ? sql<Date>`now()` : null,
      paystack_payload: JSON.stringify({
        authorization_url: `https://checkout.paystack.test/${reference}`,
      }),
    })
    .execute();
  return reference;
}

/** Sets the booking's hold to end `minutes` from now; negative for a hold that has lapsed. */
export async function setHold(db: Database, bookingId: string, minutes: number): Promise<void> {
  await db
    .updateTable('bookings')
    .set({ payment_expires_at: sql<Date>`now() + make_interval(mins => ${minutes}::int)` })
    .where('id', '=', bookingId)
    .execute();
}

export function paymentRows(db: Database, bookingId: string) {
  return db
    .selectFrom('payments')
    .selectAll()
    .where('booking_id', '=', bookingId)
    .orderBy('purpose')
    .orderBy('provider_ref')
    .execute();
}
