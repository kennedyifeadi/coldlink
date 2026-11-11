import { Router } from 'express';
import type { Logger } from 'pino';
import { createAppConfigReader, type AppConfigReader } from '../appConfig.js';
import { createAccessTokens, type AccessTokens } from '../auth/tokens.js';
import { createBackgroundTasks, type BackgroundTasks } from '../backgroundTasks.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { createTransitionHooks, type TransitionHooks } from '../bookings/hooks.js';
import { checkDatabase } from '../db/health.js';
import { createNotificationStore, type NotificationStore } from '../notifications/store.js';
import { smsTemplates } from '../notifications/templates.js';
import { createSmsProvider } from '../sms/createSmsProvider.js';
import type { SmsProvider } from '../sms/provider.js';
import { createPhotoStorage } from '../storage/createPhotoStorage.js';
import type { PhotoStorage } from '../storage/photoStorage.js';
import type { RateLimitOptions } from '../middleware/rateLimit.js';
import { version } from '../version.js';
import { authRoutes, defaultAuthIpLimits, type AuthIpLimits } from './auth.js';
import { bookingRoutes, defaultQuoteIpLimit } from './bookings.js';
import { meRoutes } from './me.js';
import { providerRoutes } from './providers.js';
import { referenceDataRoutes } from './referenceData.js';
import { defaultSearchIpLimit, searchRoutes } from './search.js';

export interface RouteDependencies {
  db: Database;
  config: Config;
  logger: Logger;
  appConfig?: AppConfigReader;
  sms?: SmsProvider;
  notificationStore?: NotificationStore;
  tasks?: BackgroundTasks;
  tokens?: AccessTokens;
  authIpLimits?: AuthIpLimits;
  searchIpLimit?: RateLimitOptions;
  quoteIpLimit?: RateLimitOptions;
  storage?: PhotoStorage;
  bookingHooks?: TransitionHooks;
  now?: () => Date;
  generateBookingCode?: () => string;
}

export function apiRoutes({
  db,
  config,
  logger,
  appConfig = createAppConfigReader(db),
  sms = createSmsProvider(config.sms, logger),
  notificationStore = createNotificationStore(db),
  tasks = createBackgroundTasks(),
  tokens = createAccessTokens(config.auth.jwtSecret),
  authIpLimits = defaultAuthIpLimits,
  searchIpLimit = defaultSearchIpLimit,
  quoteIpLimit = defaultQuoteIpLimit,
  storage = createPhotoStorage(config.storage),
  bookingHooks = createTransitionHooks(),
  now,
  generateBookingCode,
}: RouteDependencies): Router {
  const router = Router();
  router.get('/health', async (req, res) => {
    const database = await checkDatabase(db, req.log);
    const status = database === 'up' ? 'ok' : 'degraded';
    res.status(database === 'up' ? 200 : 503).json({ status, version, database });
  });
  router.use(referenceDataRoutes({ db, appConfig }));
  router.use(
    authRoutes({
      db,
      auth: config.auth,
      corsOrigins: config.corsOrigins,
      appConfig,
      tokens,
      notifications: { store: notificationStore, sms, logger, templates: smsTemplates },
      tasks,
      ipLimits: authIpLimits,
    }),
  );
  router.use(meRoutes({ db, tokens }));
  router.use(providerRoutes({ db, tokens, appConfig, storage }));
  router.use(
    searchRoutes({
      db,
      tokens,
      appConfig,
      storage,
      ipLimit: searchIpLimit,
      ...(now === undefined ? {} : { now }),
    }),
  );
  router.use(
    bookingRoutes({
      db,
      tokens,
      appConfig,
      hooks: bookingHooks,
      quoteIpLimit,
      ...(now === undefined ? {} : { now }),
      ...(generateBookingCode === undefined ? {} : { generateCode: generateBookingCode }),
    }),
  );
  return router;
}
