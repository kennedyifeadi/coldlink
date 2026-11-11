import {
  calculatePricing,
  type AppConfig,
  type BookingQuoteInput,
  type PricingBreakdown,
} from '@coldlink/shared';
import type { Database } from '../db/client.js';
import { AppError, invalidBody } from '../errors.js';
import { findProvider, type ProviderRecord } from '../providers/store.js';
import { isBookable } from '../providers/visibility.js';
import type { StoragePeriod } from '../storagePeriod.js';
import { availableQuantity } from './availability.js';

export type BookingTerms = Pick<
  BookingQuoteInput,
  'provider_id' | 'quantity' | 'capacity_unit' | 'days'
>;

export interface PricedBooking {
  provider: ProviderRecord;
  /** Free on the busiest day of the period, in the facility's unit. */
  available: number;
  pricing: PricingBreakdown;
}

/** The facility's price for the terms, with the platform rates in `config` (PRD 6.1). */
export function pricingFor(
  provider: ProviderRecord,
  terms: Pick<BookingTerms, 'quantity' | 'days'>,
  config: AppConfig,
): PricingBreakdown {
  return calculatePricing({
    quantity: terms.quantity,
    duration_days: terms.days,
    unit_price_kobo: provider.price_per_unit_per_day_kobo,
    commission_rate: config.commission_rate,
    deposit_percent: config.deposit_percent,
    service_fee_kobo: config.service_fee_kobo,
  });
}

function checkTerms(provider: ProviderRecord, terms: BookingTerms): void {
  if (terms.capacity_unit !== provider.capacity_unit) {
    throw invalidBody('capacity_unit', `This facility is listed in ${provider.capacity_unit}`);
  }
  if (terms.days < provider.min_storage_days) {
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

/**
 * Checks the terms against the facility as it is now and prices them with the given config, as
 * both a quote and a booking do (decision 76): one 404 for an unknown or hidden facility, a 400
 * for terms the facility does not offer, and a 409 when there is not enough free space.
 */
export async function priceBooking(
  db: Database,
  terms: BookingTerms,
  period: StoragePeriod,
  config: AppConfig,
): Promise<PricedBooking> {
  const provider = await findProvider(db, terms.provider_id);
  // One 404 for unknown and hidden facilities, as GET /providers/:id does (decision 63).
  if (provider === undefined || !isBookable(provider, config)) {
    throw new AppError('not_found', 'Facility not found');
  }
  checkTerms(provider, terms);

  const available = await availableQuantity(db, provider.id, period.startDate, period.endDate);
  if (available < terms.quantity) throw notEnoughSpace(provider.id, available);

  return { provider, available, pricing: pricingFor(provider, terms, config) };
}
