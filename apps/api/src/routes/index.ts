import { Router } from 'express';
import type { Logger } from 'pino';
import { createAppConfigReader, type AppConfigReader } from '../appConfig.js';
import { createAccessTokens, type AccessTokens } from '../auth/tokens.js';
import { createBackgroundTasks, type BackgroundTasks } from '../backgroundTasks.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { TransitionHooks } from '../bookings/hooks.js';
import { checkDatabase } from '../db/health.js';
import type { NotificationStore } from '../notifications/store.js';
import type { SmsProvider } from '../sms/provider.js';
import type { PaymentGateway } from '../payments/gateway.js';
import { createBookingServices, type BookingServices } from '../services.js';
import { createPhotoStorage } from '../storage/createPhotoStorage.js';
import type { PhotoStorage } from '../storage/photoStorage.js';
import type { RateLimitOptions } from '../middleware/rateLimit.js';
import { version } from '../version.js';
import { actionRoutes, defaultActionIpLimit } from './actions.js';
import { authRoutes, defaultAuthIpLimits, type AuthIpLimits } from './auth.js';
import { bookingRoutes, defaultQuoteIpLimit } from './bookings.js';
import { meRoutes } from './me.js';
import { paymentRoutes } from './payments.js';
import { providerBookingRoutes } from './providerBookings.js';
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
  actionIpLimit?: RateLimitOptions;
  storage?: PhotoStorage;
  bookingHooks?: TransitionHooks;
  paymentGateway?: PaymentGateway;
  /** Built from sms, notificationStore, bookingHooks and paymentGateway when left out. */
  services?: BookingServices;
  now?: () => Date;
  generateBookingCode?: () => string;
}

export function apiRoutes({
  db,
  config,
  logger,
  appConfig = createAppConfigReader(db),
  sms,
  notificationStore,
  tasks = createBackgroundTasks(),
  tokens = createAccessTokens(config.auth.jwtSecret),
  authIpLimits = defaultAuthIpLimits,
  searchIpLimit = defaultSearchIpLimit,
  quoteIpLimit = defaultQuoteIpLimit,
  actionIpLimit = defaultActionIpLimit,
  storage = createPhotoStorage(config.storage),
  bookingHooks,
  paymentGateway,
  services = createBookingServices({
    db,
    config,
    logger,
    ...(sms === undefined ? {} : { sms }),
    ...(notificationStore === undefined ? {} : { notificationStore }),
    ...(bookingHooks === undefined ? {} : { hooks: bookingHooks }),
    ...(paymentGateway === undefined ? {} : { gateway: paymentGateway }),
  }),
  now,
  generateBookingCode,
}: RouteDependencies): Router {
  const { hooks, notifications, gateway } = services;
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
      notifications,
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
      hooks,
      quoteIpLimit,
      ...(now === undefined ? {} : { now }),
      ...(generateBookingCode === undefined ? {} : { generateCode: generateBookingCode }),
    }),
  );
  router.use(
    providerBookingRoutes({
      db,
      tokens,
      hooks,
      ...(now === undefined ? {} : { now }),
    }),
  );
  router.use(
    actionRoutes({
      db,
      hooks,
      ipLimit: actionIpLimit,
      ...(now === undefined ? {} : { now }),
    }),
  );
  router.use(
    paymentRoutes({
      db,
      tokens,
      appConfig,
      gateway,
      hooks,
      config,
      logger,
      tasks,
    }),
  );
  return router;
}
