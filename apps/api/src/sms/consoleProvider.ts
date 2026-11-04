import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { maskPhoneNumbers } from '../redact.js';
import type { SmsProvider } from './provider.js';

/** Sends nothing: logs the template and masked number, never the text, which may hold an OTP. */
export function createConsoleSmsProvider(logger: Logger): SmsProvider {
  return {
    send({ to, text, template }) {
      const providerMessageId = `console-${randomUUID()}`;
      logger.info(
        { recipient: maskPhoneNumbers(to), template, length: text.length, providerMessageId },
        'SMS not sent: the console provider only logs it',
      );
      return Promise.resolve({ providerMessageId });
    },
  };
}
