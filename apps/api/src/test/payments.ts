import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import {
  PaymentGatewayError,
  type ChargeRequest,
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
 * An in-memory gateway. `charges` is what verify answers, by reference; a refund fails while
 * `failRefunds` is set. Every call is recorded.
 */
export function fakePaymentGateway() {
  const charges = new Map<string, GatewayCharge>();
  const initialized: ChargeRequest[] = [];
  const refunds: RefundRequest[] = [];
  const state = { failRefunds: false, failInitialize: false };
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
      return Promise.resolve({ refundId: `refund-${refundCount}`, status: 'pending' });
    },
    isSignedWebhook(rawBody, signature) {
      return signature === paystackSignature(FAKE_PAYSTACK_SECRET, rawBody);
    },
  };

  /** Makes verify report the charge as paid. */
  function pay(reference: string, amountKobo: number, currency = 'NGN'): void {
    charges.set(reference, {
      reference,
      status: 'success',
      amountKobo,
      currency,
      record: { id: '4099260516', status: 'success', amount: amountKobo, currency },
    });
  }

  return { gateway, charges, initialized, refunds, state, pay };
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
