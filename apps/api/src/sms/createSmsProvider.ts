import type { Logger } from 'pino';
import type { SmsConfig } from '../config.js';
import { createConsoleSmsProvider } from './consoleProvider.js';
import type { SmsProvider } from './provider.js';
import { createTermiiSmsProvider } from './termiiProvider.js';

export function createSmsProvider(config: SmsConfig, logger: Logger): SmsProvider {
  return config.provider === 'termii'
    ? createTermiiSmsProvider(config.termii)
    : createConsoleSmsProvider(logger);
}
