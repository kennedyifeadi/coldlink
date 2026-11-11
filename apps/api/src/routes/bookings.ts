import {
  bookingQuoteBodySchema,
  type BookingQuote,
  type BookingQuoteInput,
} from '@coldlink/shared';
import { Router } from 'express';
import type { AppConfigReader } from '../appConfig.js';
import { priceBooking, type PricedBooking } from '../bookings/pricing.js';
import { optionalAuth, type AuthDependencies } from '../middleware/auth.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { storagePeriod, type StoragePeriod } from '../storagePeriod.js';

// As loose as search (decision 74): a farmer adjusting quantity and days asks for several quotes.
export const defaultQuoteIpLimit: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 300 };

export interface BookingRouteDependencies extends AuthDependencies {
  appConfig: AppConfigReader;
  quoteIpLimit: RateLimitOptions;
  now?: () => Date;
}

function toQuote(
  input: BookingQuoteInput,
  period: StoragePeriod,
  { provider, available, pricing }: PricedBooking,
): BookingQuote {
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
      const priced = await priceBooking(db, input, period, config);
      res.json(toQuote(input, period, priced));
    },
  );

  return router;
}
