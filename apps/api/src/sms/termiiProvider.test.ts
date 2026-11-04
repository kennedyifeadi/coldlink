import { describe, expect, it, vi } from 'vitest';
import type { TermiiConfig } from '../config.js';
import { SmsSendError } from './provider.js';
import { createTermiiSmsProvider } from './termiiProvider.js';

const config: TermiiConfig = {
  apiKey: 'termii-secret-key',
  senderId: 'ColdLink',
  baseUrl: 'https://v3.api.termii.com',
  channel: 'dnd',
};
const message = { to: '+2348031234567', text: 'Your ColdLink code is 482913.', template: 'otp' };

function sentBody(fetchFn: ReturnType<typeof respondWith>): unknown {
  const body = fetchFn.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON string body');
  return JSON.parse(body);
}

function respondWith(response: Response) {
  return vi.fn<typeof fetch>(() => Promise.resolve(response));
}

function okResponse(
  body: unknown = { code: 'ok', message_id_str: '3017544054459', message_id: 3017544054459 },
) {
  return new Response(JSON.stringify(body), { status: 200 });
}

async function sendError(send: Promise<unknown>): Promise<SmsSendError> {
  try {
    await send;
  } catch (error) {
    if (error instanceof SmsSendError) return error;
    throw error;
  }
  throw new Error('Expected the send to fail');
}

describe('Termii SMS provider', () => {
  it('posts the message to /api/sms/send on the DND channel', async () => {
    const fetchFn = respondWith(okResponse());
    const receipt = await createTermiiSmsProvider(config, { fetch: fetchFn }).send(message);

    expect(receipt).toEqual({ providerMessageId: '3017544054459' });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toEqual(new URL('https://v3.api.termii.com/api/sms/send'));
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(sentBody(fetchFn)).toEqual({
      api_key: 'termii-secret-key',
      to: '2348031234567',
      from: 'ColdLink',
      sms: 'Your ColdLink code is 482913.',
      type: 'plain',
      channel: 'dnd',
    });
  });

  it('uses the configured channel', async () => {
    const fetchFn = respondWith(okResponse());
    await createTermiiSmsProvider({ ...config, channel: 'generic' }, { fetch: fetchFn }).send(
      message,
    );
    expect(sentBody(fetchFn)).toMatchObject({ channel: 'generic' });
  });

  it('falls back to a numeric message_id', async () => {
    const fetchFn = respondWith(okResponse({ code: 'ok', message_id: 42 }));
    await expect(
      createTermiiSmsProvider(config, { fetch: fetchFn }).send(message),
    ).resolves.toEqual({ providerMessageId: '42' });
  });

  it('gives up after the timeout, as a retryable error', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason);
          });
        }),
    );
    const error = await sendError(
      createTermiiSmsProvider(config, { fetch: fetchFn, timeoutMs: 20 }).send(message),
    );
    expect(error.message).toBe('Termii request timed out after 20 ms');
    expect(error.retryable).toBe(true);
  });

  it('treats a network failure as retryable', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    const error = await sendError(
      createTermiiSmsProvider(config, { fetch: fetchFn }).send(message),
    );
    expect(error).toMatchObject({
      message: 'Termii request failed before a response',
      retryable: true,
    });
  });

  it.each([
    [429, true],
    [500, true],
    [502, true],
    [503, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [422, false],
  ])('maps HTTP %i to retryable=%s', async (status, retryable) => {
    const fetchFn = respondWith(
      new Response(JSON.stringify({ message: `Invalid key termii-secret-key for ${message.to}` }), {
        status,
      }),
    );
    const error = await sendError(
      createTermiiSmsProvider(config, { fetch: fetchFn }).send(message),
    );
    expect(error.message).toBe(`Termii returned HTTP ${status}`);
    expect(error.retryable).toBe(retryable);
  });

  it.each([
    ['no message ID', okResponse({ code: 'ok', message: 'Successfully Sent' })],
    ['a body that is not JSON', new Response('<html>ok</html>', { status: 200 })],
  ])('does not retry a 200 with %s, since the message may have gone', async (_case, response) => {
    const error = await sendError(
      createTermiiSmsProvider(config, { fetch: respondWith(response) }).send(message),
    );
    expect(error.retryable).toBe(false);
  });

  it('never puts the API key, number or text in an error', async () => {
    const failures = [
      respondWith(new Response('{}', { status: 401 })),
      vi.fn<typeof fetch>(() =>
        Promise.reject(new TypeError(`fetch failed: ${config.apiKey} ${message.to}`)),
      ),
      respondWith(okResponse({})),
    ];
    for (const fetchFn of failures) {
      const error = await sendError(
        createTermiiSmsProvider(config, { fetch: fetchFn }).send(message),
      );
      const text = `${error.message} ${JSON.stringify(error)}`;
      expect(text).not.toContain(config.apiKey);
      expect(text).not.toContain('8031234567');
      expect(text).not.toContain('482913');
    }
  });
});
