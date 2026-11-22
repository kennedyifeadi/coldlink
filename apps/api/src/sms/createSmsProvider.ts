import type { Logger } from 'pino';
import type { SmsConfig } from '../config.js';
import { createConsoleSmsProvider, type ConsoleSmsOptions } from './consoleProvider.js';
import type { SmsProvider } from './provider.js';
import { createTermiiSmsProvider } from './termiiProvider.js';

export function createSmsProvider(
  config: SmsConfig,
  logger: Logger,
  consoleOptions?: ConsoleSmsOptions,
): SmsProvider {
  return config.provider === 'termii'
    ? createTermiiSmsProvider(config.termii)
    : createConsoleSmsProvider(logger, consoleOptions);
}
