import type { Router } from 'express';
import { createApp } from '../app.js';
import type { Config } from '../config.js';
import { createLogger } from '../logger.js';

export const ALLOWED_ORIGIN = 'https://app.coldlink.test';

export const testConfig: Config = {
  nodeEnv: 'test',
  port: 0,
  logLevel: 'silent',
  corsOrigins: [ALLOWED_ORIGIN],
};

export function captureLogs() {
  const lines: string[] = [];
  const logger = createLogger('info', {
    write: (line: string) => {
      lines.push(line);
    },
  });
  return { logger, lines, output: () => lines.join('') };
}

export function testApp(routes?: Router) {
  const logs = captureLogs();
  const app = createApp(
    testConfig,
    routes === undefined ? { logger: logs.logger } : { logger: logs.logger, routes },
  );
  return { app, logs };
}
