import type { Logger } from 'pino';
import { createTransitionHooks, type TransitionHooks } from './bookings/hooks.js';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import {
  createProviderActionLinks,
  registerBookingSmsHooks,
} from './notifications/bookingSmsHooks.js';
import { createSmsTemplateRegistry, type SmsTemplateRegistry } from './notifications/registry.js';
import type { NotificationDeps } from './notifications/send.js';
import { createNotificationStore, type NotificationStore } from './notifications/store.js';
import { createPaymentGateway } from './payments/createPaymentGateway.js';
import type { PaymentGateway } from './payments/gateway.js';
import { registerPayoutHooks } from './payments/payoutHooks.js';
import { registerRefundHooks } from './payments/refundHooks.js';
import { createSmsProvider } from './sms/createSmsProvider.js';
import type { SmsProvider } from './sms/provider.js';

/** The booking side effects the routes and the scheduled jobs share. */
export interface BookingServices {
  /** Transition hooks with the payout, refund and SMS hooks registered. */
  hooks: TransitionHooks;
  notifications: NotificationDeps<SmsTemplateRegistry>;
  gateway: PaymentGateway;
}

export interface BookingServiceOptions {
  db: Database;
  config: Config;
  logger: Logger;
  sms?: SmsProvider;
  notificationStore?: NotificationStore;
  hooks?: TransitionHooks;
  gateway?: PaymentGateway;
}

/**
 * Registers every booking hook once. Built once per process, so a transition made by a route and
 * one made by a job refund and text through the same hooks.
 */
export function createBookingServices({
  db,
  config,
  logger,
  sms = createSmsProvider(config.sms, logger, { showText: config.auth.devOtp }),
  notificationStore = createNotificationStore(db),
  hooks = createTransitionHooks(),
  gateway = createPaymentGateway(config.paystack),
}: BookingServiceOptions): BookingServices {
  registerPayoutHooks(hooks);
  registerRefundHooks(hooks, { db, gateway, logger });
  const links = createProviderActionLinks(db, config.webAppUrl);
  const notifications = {
    store: notificationStore,
    sms,
    logger,
    templates: createSmsTemplateRegistry(links),
  };
  registerBookingSmsHooks(hooks, { db, notifications, links });
  return { hooks, notifications, gateway };
}
