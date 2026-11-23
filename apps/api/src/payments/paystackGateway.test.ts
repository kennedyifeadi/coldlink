import { describe, expect, it, vi } from 'vitest';
import { maskReference, PaymentGatewayError } from './gateway.js';
import {
  createPaystackGateway,
  paystackSignature,
  successfulChargeFromEvent,
} from './paystackGateway.js';

// Shaped as a Paystack key, but not a real one; nothing here reaches the network.
const secretKey = 'sk_test_0000000000fake';
const config = { secretKey, publicKey: 'pk_test_0000000000fake' };
const reference = 'CLP-0123456789abcdef0123';

const paidCharge = {
  id: 4_099_260_516,
  reference,
  status: 'success',
  amount: 4_064_400,
  currency: 'NGN',
  channel: 'card',
  gateway_response: 'Successful',
  paid_at: '2026-11-10T08:05:00.000Z',
  customer: { email: 'farmer-1234567@example.com', phone: '+2348031234567' },
  authorization: { authorization_code: 'AUTH_secret', last4: '4081' },
};

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

function gatewayWith(fetchFn: typeof fetch, timeoutMs?: number) {
  return createPaystackGateway(config, {
    fetch: fetchFn,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function sentRequest(fetchFn: ReturnType<typeof respond>) {
  const [url, init] = fetchFn.mock.calls[0] ?? [];
  return {
    url: url instanceof URL ? url.href : url instanceof Request ? url.url : url,
    init,
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    headers: new Headers(init?.headers),
  };
}

async function gatewayError(call: Promise<unknown>): Promise<PaymentGatewayError> {
  try {
    await call;
  } catch (error) {
    if (error instanceof PaymentGatewayError) return error;
    throw error;
  }
  throw new Error('Expected the call to fail');
}

describe('Paystack gateway', () => {
  it('initializes a charge in kobo and NGN, with the channels and callback, and a timeout', async () => {
    const fetchFn = respond(200, {
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/abc123',
        access_code: 'abc123',
        reference,
      },
    });

    const page = await gatewayWith(fetchFn).initialize({
      reference,
      amountKobo: 4_064_400,
      email: 'farmer-1234567@example.com',
      callbackUrl: 'https://coldlink.ng/payment/return',
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    });

    expect(page).toEqual({
      authorizationUrl: 'https://checkout.paystack.com/abc123',
      accessCode: 'abc123',
    });
    const sent = sentRequest(fetchFn);
    expect(sent.url).toBe('https://api.paystack.co/transaction/initialize');
    expect(sent.init?.method).toBe('POST');
    expect(sent.headers.get('authorization')).toBe(`Bearer ${secretKey}`);
    expect(sent.body).toEqual({
      reference,
      amount: 4_064_400,
      currency: 'NGN',
      email: 'farmer-1234567@example.com',
      callback_url: 'https://coldlink.ng/payment/return',
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    });
    expect(sent.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('verifies a charge and keeps nothing about the payer', async () => {
    const fetchFn = respond(200, { status: true, data: paidCharge });

    const charge = await gatewayWith(fetchFn).verify(reference);

    expect(sentRequest(fetchFn).url).toBe(
      `https://api.paystack.co/transaction/verify/${reference}`,
    );
    expect(charge).toEqual({
      reference,
      status: 'success',
      amountKobo: 4_064_400,
      currency: 'NGN',
      record: {
        id: '4099260516',
        status: 'success',
        amount: 4_064_400,
        currency: 'NGN',
        channel: 'card',
        gateway_response: 'Successful',
        paid_at: '2026-11-10T08:05:00.000Z',
      },
    });
    expect(JSON.stringify(charge)).not.toMatch(/AUTH_secret|example.com|2348031234567/);
  });

  it('refuses a verify answer for another reference', async () => {
    const fetchFn = respond(200, {
      status: true,
      data: { ...paidCharge, reference: 'CLP-ffffffffffffffffffff' },
    });

    const error = await gatewayError(gatewayWith(fetchFn).verify(reference));

    expect(error.message).not.toContain(reference);
  });

  it('refunds part of a charge by its reference', async () => {
    const fetchFn = respond(200, {
      status: true,
      data: { id: 3_018_284, status: 'pending', amount: 1_500_000 },
    });

    const refund = await gatewayWith(fetchFn).refund({
      chargeReference: reference,
      amountKobo: 1_500_000,
    });

    expect(refund).toEqual({ refundId: '3018284', status: 'pending' });
    const sent = sentRequest(fetchFn);
    expect(sent.url).toBe('https://api.paystack.co/refund');
    expect(sent.body).toEqual({ transaction: reference, amount: 1_500_000 });
  });

  describe('listing refunds', () => {
    const listed = (refunds: object[]) =>
      respond(200, { status: true, data: refunds, meta: { total: refunds.length } });

    it("asks for all the charge's refunds by its id", async () => {
      const fetchFn = listed([]);

      await gatewayWith(fetchFn).listRefunds({
        chargeReference: reference,
        transactionId: '4099260516',
      });

      const sent = sentRequest(fetchFn);
      expect(sent.init?.method).toBe('GET');
      const url = new URL(String(sent.url));
      expect(url.origin + url.pathname).toBe('https://api.paystack.co/refund');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        perPage: '100',
        transaction: '4099260516',
      });
    });

    it("keeps only the charge's own refunds, matched by id or reference", async () => {
      const fetchFn = listed([
        { id: 1, status: 'processed', amount: 4_064_400, transaction: 4_099_260_516 },
        { id: 2, status: 'pending', amount: 500, transaction: 1, transaction_reference: reference },
        { id: 3, status: 'pending', amount: 700, transaction: 2, transaction_reference: 'CLP-x' },
      ]);

      await expect(
        gatewayWith(fetchFn).listRefunds({
          chargeReference: reference,
          transactionId: '4099260516',
        }),
      ).resolves.toEqual([
        { refundId: '1', status: 'processed', amountKobo: 4_064_400 },
        { refundId: '2', status: 'pending', amountKobo: 500 },
      ]);
    });

    it('reports an unexpected answer without the key', async () => {
      const error = await gatewayError(
        gatewayWith(respond(200, { status: true, data: { id: 1 } })).listRefunds({
          chargeReference: reference,
          transactionId: '4099260516',
        }),
      );

      expect(error.message).toBe('Paystack list refunds returned an unexpected body');
      expect(error.message).not.toContain(secretKey);
    });
  });

  it.each([
    ['an HTTP error', respond(400, { status: false, message: `Bad key ${secretKey}` }), /HTTP 400/],
    ['a body that is not Paystack success', respond(200, { status: false }), /unexpected body/],
    [
      'a network failure',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed'))),
      /failed before a response/,
    ],
  ])('reports %s without the key or the body', async (_name, fetchFn, message) => {
    const error = await gatewayError(gatewayWith(fetchFn).verify(reference));

    expect(error.message).toMatch(message);
    expect(error.message).not.toContain(secretKey);
    expect(error.message).not.toContain('Bad key');
  });

  it('gives up after its timeout', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );

    const error = await gatewayError(
      gatewayWith(fetchFn, 20).refund({
        chargeReference: reference,
        amountKobo: 100,
      }),
    );

    expect(error.message).toBe('Paystack refund timed out after 20 ms');
  });
});

describe('Paystack webhook signature', () => {
  const gateway = gatewayWith(respond(500, {}));
  const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: paidCharge }));

  it('accepts the HMAC-SHA512 of the raw body with the secret key', () => {
    expect(gateway.isSignedWebhook(body, paystackSignature(secretKey, body))).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['made with another key', paystackSignature('sk_test_another', body)],
    ['for another body', paystackSignature(secretKey, Buffer.from('{}'))],
    ['not hex', 'z'.repeat(128)],
    ['too short', 'ab'],
  ])('refuses a signature that is %s', (_name, signature) => {
    expect(gateway.isSignedWebhook(body, signature)).toBe(false);
  });
});

describe('successfulChargeFromEvent', () => {
  it('reads the charge from charge.success', () => {
    expect(successfulChargeFromEvent({ event: 'charge.success', data: paidCharge })).toMatchObject({
      reference,
      status: 'success',
      amountKobo: 4_064_400,
      currency: 'NGN',
    });
  });

  it.each([
    ['another event', { event: 'refund.processed', data: paidCharge }],
    ['a malformed charge', { event: 'charge.success', data: { reference } }],
    ['no event', 'nonsense'],
  ])('ignores %s', (_name, event) => {
    expect(successfulChargeFromEvent(event)).toBeUndefined();
  });
});

describe('maskReference', () => {
  it('keeps only the prefix and the last four characters', () => {
    expect(maskReference(reference)).toBe('CLP-***0123');
  });
});
