import { createHmac, timingSafeEqual } from 'node:crypto';
import * as z from 'zod';
import type { PaystackConfig } from '../config.js';
import {
  maskReference,
  PaymentGatewayError,
  type GatewayCharge,
  type PaymentGateway,
} from './gateway.js';

const PAYSTACK_API = 'https://api.paystack.co';

// Paystack usually answers in well under a second; the farmer is waiting on initialize and verify,
// and a refund runs after a commit, so none should hang for longer than an SMS send does.
const REQUEST_TIMEOUT_MS = 10_000;

// A hex HMAC-SHA512 is 128 characters.
const SIGNATURE = /^[0-9a-f]{128}$/;

const envelopeSchema = z.object({ status: z.literal(true), data: z.unknown() });

const initializeDataSchema = z.object({
  authorization_url: z.url({ protocol: /^https$/ }),
  access_code: z.string().min(1),
});

// Only what ColdLink needs about the charge; the customer, card and authorization code are never
// read, so they are never stored (decision 93).
const chargeDataSchema = z.object({
  id: z.union([z.number(), z.string()]),
  reference: z.string().min(1),
  status: z.string().min(1),
  amount: z.int().nonnegative(),
  currency: z.string().min(1),
  channel: z.string().nullish(),
  gateway_response: z.string().nullish(),
  paid_at: z.string().nullish(),
});

const refundDataSchema = z.object({
  id: z.union([z.number(), z.string()]),
  status: z.string().min(1),
});

const chargeEventSchema = z.object({
  event: z.literal('charge.success'),
  data: chargeDataSchema,
});

function toCharge(data: z.infer<typeof chargeDataSchema>): GatewayCharge {
  return {
    reference: data.reference,
    status: data.status,
    amountKobo: data.amount,
    currency: data.currency,
    record: {
      id: String(data.id),
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      channel: data.channel ?? null,
      gateway_response: data.gateway_response ?? null,
      paid_at: data.paid_at ?? null,
    },
  };
}

/** The charge in a `charge.success` webhook event, or undefined for any other event. */
export function successfulChargeFromEvent(event: unknown): GatewayCharge | undefined {
  const parsed = chargeEventSchema.safeParse(event);
  return parsed.success ? toCharge(parsed.data.data) : undefined;
}

export function paystackSignature(secretKey: string, rawBody: Buffer): string {
  return createHmac('sha512', secretKey).update(rawBody).digest('hex');
}

export interface PaystackGatewayOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Paystack's Transaction and Refund APIs. Errors name the operation and the HTTP status or failure
 * only: never the key, a request or response body, or a full reference.
 */
export function createPaystackGateway(
  { secretKey }: PaystackConfig,
  { fetch: fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS }: PaystackGatewayOptions = {},
): PaymentGateway {
  async function call<T>(
    operation: string,
    path: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(new URL(path, PAYSTACK_API), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? `timed out after ${timeoutMs} ms`
          : 'failed before a response';
      throw new PaymentGatewayError(`Paystack ${operation} ${reason}`);
    }
    if (!response.ok) {
      throw new PaymentGatewayError(`Paystack ${operation} returned HTTP ${response.status}`);
    }
    const envelope = envelopeSchema.safeParse(await response.json().catch(() => undefined));
    const data = envelope.success ? schema.safeParse(envelope.data.data) : undefined;
    if (data?.success !== true) {
      throw new PaymentGatewayError(`Paystack ${operation} returned an unexpected body`);
    }
    return data.data;
  }

  return {
    async initialize({ reference, amountKobo, email, callbackUrl, channels }) {
      const data = await call('initialize', '/transaction/initialize', initializeDataSchema, {
        reference,
        amount: amountKobo,
        currency: 'NGN',
        email,
        callback_url: callbackUrl,
        channels,
      });
      return { authorizationUrl: data.authorization_url, accessCode: data.access_code };
    },

    async verify(reference) {
      const data = await call(
        'verify',
        `/transaction/verify/${encodeURIComponent(reference)}`,
        chargeDataSchema,
      );
      if (data.reference !== reference) {
        throw new PaymentGatewayError(
          `Paystack verify answered for another reference than ${maskReference(reference)}`,
        );
      }
      return toCharge(data);
    },

    async refund({ chargeReference, amountKobo }) {
      const data = await call('refund', '/refund', refundDataSchema, {
        transaction: chargeReference,
        amount: amountKobo,
      });
      return { refundId: String(data.id), status: data.status };
    },

    isSignedWebhook(rawBody, signature) {
      if (signature === undefined || !SIGNATURE.test(signature)) return false;
      const expected = Buffer.from(paystackSignature(secretKey, rawBody), 'hex');
      return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
    },
  };
}
