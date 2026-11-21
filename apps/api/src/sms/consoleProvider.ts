import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { maskPhoneNumbers } from '../redact.js';
import type { SmsProvider } from './provider.js';

export interface ConsoleSmsOptions {
  /**
   * Also logs the text, which may hold an OTP or an action link, so the flows can be run without
   * a phone. Only where the dev OTP is allowed (decision 111).
   */
  showText?: boolean;
}

/** Sends nothing: logs the template and masked number, and the text only when asked. */
export function createConsoleSmsProvider(
  logger: Logger,
  { showText = false }: ConsoleSmsOptions = {},
): SmsProvider {
  return {
    send({ to, text, template }) {
      const providerMessageId = `console-${randomUUID()}`;
      logger.info(
        {
          recipient: maskPhoneNumbers(to),
          template,
          length: text.length,
          providerMessageId,
          ...(showText ? { text } : {}),
        },
        'SMS not sent: the console provider only logs it',
      );
      return Promise.resolve({ providerMessageId });
    },
  };
}
