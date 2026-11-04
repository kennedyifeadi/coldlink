import * as z from 'zod';
import type { TermiiConfig } from '../config.js';
import { SmsSendError, type SmsProvider } from './provider.js';

// Long enough for a slow mobile-network gateway, short enough that an inline send does not hold
// up the caller's request for long.
const REQUEST_TIMEOUT_MS = 10_000;

const sendResponseSchema = z.object({
  message_id_str: z.string().min(1).optional(),
  message_id: z.union([z.string().min(1), z.number()]).optional(),
});

// 429 and 5xx are Termii being busy or down. Every other status is a request it will refuse
// again: a bad key (401), no permission (403), or a body it cannot act on (400, 422).
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface TermiiProviderOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends through Termii's SMS API (`POST /api/sms/send`). Errors never carry the API key, the
 * text or the number: they name only what went wrong.
 */
export function createTermiiSmsProvider(
  config: TermiiConfig,
  { fetch: fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS }: TermiiProviderOptions = {},
): SmsProvider {
  const endpoint = new URL('/api/sms/send', config.baseUrl);

  return {
    async send({ to, text }) {
      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: config.apiKey,
            // Termii takes the international number without the plus.
            to: to.replace(/^\+/, ''),
            from: config.senderId,
            sms: text,
            type: 'plain',
            channel: config.channel,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // A timeout or network failure may still have reached Termii; a retry risks a duplicate
        // message, which is better than none.
        const reason =
          error instanceof DOMException && error.name === 'TimeoutError'
            ? `timed out after ${timeoutMs} ms`
            : 'failed before a response';
        throw new SmsSendError(`Termii request ${reason}`, true);
      }
      if (!response.ok) {
        throw new SmsSendError(
          `Termii returned HTTP ${response.status}`,
          isRetryableStatus(response.status),
        );
      }
      // Termii accepted the request, so it may have sent the message: never retry from here.
      const body = sendResponseSchema.safeParse(await response.json().catch(() => undefined));
      const id = body.success ? (body.data.message_id_str ?? body.data.message_id) : undefined;
      if (id === undefined) {
        throw new SmsSendError('Termii accepted the request but returned no message ID', false);
      }
      return { providerMessageId: String(id) };
    },
  };
}
