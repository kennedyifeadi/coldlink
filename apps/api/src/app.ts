import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { BackgroundTasks } from './backgroundTasks.js';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { createLogger } from './logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { API_BASE_PATH } from './paths.js';
import { apiRoutes } from './routes/index.js';

export { API_BASE_PATH } from './paths.js';
const JSON_BODY_LIMIT = '100kb';

export interface AppOptions {
  db: Database;
  logger?: Logger;
  /** Work that outlives a request, drained on shutdown. */
  tasks?: BackgroundTasks;
  routes?: Router;
}

export function createApp(
  config: Config,
  {
    db,
    logger = createLogger(config.logLevel),
    tasks,
    routes = apiRoutes({ db, config, logger, ...(tasks === undefined ? {} : { tasks }) }),
  }: AppOptions,
): Express {
  const app = express();
  // Behind Render's or Railway's proxy the client IP, which the rate limits key on, is in
  // X-Forwarded-For.
  app.set('trust proxy', config.trustProxyHops);
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  // credentials lets the allowlisted web app send the refresh cookie (decision 58).
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(API_BASE_PATH, routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
