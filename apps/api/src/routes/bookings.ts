import {
  bookingQuoteBodySchema,
  calculatePricing,
  type AppConfig,
  type BookingQuote,
  type BookingQuoteInput,
} from '@coldlink/shared';
import { Router } from 'express';
import type { AppConfigReader } from '../appConfig.js';
import { availableQuantity } from '../bookings/availability.js';
import { AppError, invalidBody } from '../errors.js';
import { optionalAuth, type AuthDependencies } from '../middleware/auth.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { findProvider, type ProviderRecord } from '../providers/store.js';
import { isBookable } from '../providers/visibility.js';
import { storagePeriod, type StoragePeriod } from '../storagePeriod.js';

// As loose as search (decision 74): a farmer adjusting quantity and days asks for several quotes.
export const defaultQuoteIpLimit: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 300 };

export interface BookingRouteDependencies extends AuthDependencies {
  appConfig: AppConfigReader;
  quoteIpLimit: RateLimitOptions;
  now?: () => Date;
}

function checkTerms(provider: ProviderRecord, input: BookingQuoteInput): void {
  if (input.capacity_unit !== provider.capacity_unit) {
    throw invalidBody('capacity_unit', `This facility is listed in ${provider.capacity_unit}`);
  }
  if (input.days < provider.min_storage_days) {
    throw invalidBody(
      'days',
      `This facility stores for at least ${provider.min_storage_days} days`,
    );
  }
}

function notEnoughSpace(providerId: string, available: number): AppError {
  return new AppError(
    'conflict',
    'The facility does not have that much space free on those dates',
    {
      provider_id: providerId,
      available_quantity: available,
    },
  );
}

function toQuote(
  provider: ProviderRecord,
  input: BookingQuoteInput,
  config: AppConfig,
  period: StoragePeriod,
  available: number,
): BookingQuote {
  const pricing = calculatePricing({
    quantity: input.quantity,
    duration_days: input.days,
    unit_price_kobo: provider.price_per_unit_per_day_kobo,
    commission_rate: config.commission_rate,
    deposit_percent: config.deposit_percent,
    service_fee_kobo: config.service_fee_kobo,
  });
  return {
    provider_id: provider.id,
    quantity: input.quantity,
    capacity_unit: provider.capacity_unit,
    start_date: period.startDate,
    duration_days: input.days,
    end_date: period.endDate,
    available_quantity: available,
    unit_price_kobo: provider.price_per_unit_per_day_kobo,
    storage_subtotal_kobo: pricing.storage_subtotal_kobo,
    deposit_kobo: pricing.deposit_kobo,
    balance_due_kobo: pricing.balance_due_kobo,
    service_fee_kobo: pricing.service_fee_kobo,
    delivery_fee_kobo: pricing.delivery_fee_kobo,
    total_charged_online_kobo: pricing.total_charged_online_kobo,
  };
}

export function bookingRoutes(deps: BookingRouteDependencies): Router {
  const { db, appConfig, quoteIpLimit, now = () => new Date() } = deps;
  const router = Router();

  // Reads only: a quote holds no capacity and writes no row (PRD 8).
  router.post(
    '/bookings/quote',
    rateLimit(quoteIpLimit),
    optionalAuth(deps),
    validate({ body: bookingQuoteBodySchema }),
    async (req, res) => {
      const input = req.body as BookingQuoteInput;
      const period = storagePeriod(input.start_date, input.days, now());
      const config = await appConfig.get();
      const provider = await findProvider(db, input.provider_id);
      // One 404 for unknown and hidden facilities, as GET /providers/:id does (decision 63).
      if (provider === undefined || !isBookable(provider, config)) {
        throw new AppError('not_found', 'Facility not found');
      }
      checkTerms(provider, input);

      const available = await availableQuantity(db, provider.id, period.startDate, period.endDate);
      if (available < input.quantity) throw notEnoughSpace(provider.id, available);

      res.json(toQuote(provider, input, config, period, available));
    },
  );

  return router;
}
