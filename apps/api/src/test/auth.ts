import type { AppConfig } from '@coldlink/shared';
import type { Response } from 'supertest';
import { createApp } from '../app.js';
import { createBackgroundTasks } from '../backgroundTasks.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { NotificationStore } from '../notifications/store.js';
import { REFRESH_COOKIE } from '../routes/auth.js';
import { apiRoutes, type RouteDependencies } from '../routes/index.js';
import { captureLogs, testConfig } from './helpers.js';
import { fakeSmsProvider } from './notifications.js';

// PRD 5.15 placeholders, as the seed_reference_data migration stores them.
export const appConfigValues: AppConfig = {
  commission_rate: 0.075,
  service_fee_kobo: 0,
  deposit_percent: 0.3,
  provider_response_minutes: 120,
  payment_hold_minutes: 15,
  search_default_radius_km: 25,
  search_max_radius_km: 100,
  delivery_base_fee_kobo: 100_000,
  delivery_per_km_kobo: 10_000,
  delivery_min_fee_kobo: 100_000,
  delivery_partner_share: 0.8,
  road_distance_factor: 1.3,
  require_provider_approval: true,
  otp_required: true,
  farmer_free_cancel_hours: 24,
};

export function appConfigRows(overrides: Partial<AppConfig> = {}) {
  return Object.entries({ ...appConfigValues, ...overrides }).map(([key, value]) => ({
    key,
    value,
  }));
}

export interface AuthAppOptions {
  db: Database;
  config?: Config;
  notificationStore?: NotificationStore;
  authIpLimits?: RouteDependencies['authIpLimits'];
}

/**
 * The real app with a fake SMS provider that keeps every message, so tests can read the code the
 * way a user reads the SMS. Call `settle()` after a code request: the SMS goes after the response.
 */
export function authTestApp({ db, config = testConfig, ...overrides }: AuthAppOptions) {
  const logs = captureLogs();
  const sms = fakeSmsProvider();
  const tasks = createBackgroundTasks();
  const routes = apiRoutes({
    db,
    config,
    logger: logs.logger,
    sms: sms.provider,
    tasks,
    ...overrides,
  });
  const app = createApp(config, { db, logger: logs.logger, routes });
  return {
    app,
    logs,
    sent: sms.sent,
    settle: () => tasks.drain(),
    /** The code in the latest SMS. */
    lastCode(): string {
      const code = /\b(\d{6})\b/.exec(sms.sent.at(-1)?.text ?? '')?.[1];
      if (code === undefined) throw new Error('No OTP has been sent');
      return code;
    },
  };
}

/** The refresh cookie the response set, as a `Cookie` header value. */
export function refreshCookie(response: Response): string {
  const header: unknown = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header.map(String) : [];
  const cookie = cookies.find((value) => value.startsWith(`${REFRESH_COOKIE}=`));
  const pair = cookie?.split(';')[0];
  if (pair === undefined || pair === `${REFRESH_COOKIE}=`) throw new Error('No refresh cookie set');
  return pair;
}
