import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import { createLogger } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiRoutes } from './routes/index.js';

export const API_BASE_PATH = '/api/v1';
const JSON_BODY_LIMIT = '100kb';

export interface AppOptions {
  logger?: Logger;
  routes?: Router;
}

export function createApp(
  config: Config,
  { logger = createLogger(config.logLevel), routes = apiRoutes() }: AppOptions = {},
): Express {
  const app = express();
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(API_BASE_PATH, routes);
  return app;
}
