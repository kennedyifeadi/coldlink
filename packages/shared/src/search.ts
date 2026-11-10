import * as z from 'zod';
import { capacityUnitSchema } from './enums.js';
import { koboSchema } from './money.js';
import { pricingInputSchema } from './pricing.js';
import { publicProviderSchema } from './providers.js';

// Request and response bodies of POST /search (PRD 6.8, 7.3).

/** Storage periods longer than a year are not offered, as for `min_storage_days`. */
export const MAX_SEARCH_DAYS = 365;

export const searchBodySchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  crop_id: z.uuid(),
  // Quantity is in the provider's unit (PRD 5.5), so the farmer says which unit they mean and only
  // providers listed in it match (decision 71).
  quantity: pricingInputSchema.shape.quantity,
  capacity_unit: capacityUnitSchema,
  days: pricingInputSchema.shape.duration_days.max(MAX_SEARCH_DAYS),
  /** Today in Africa/Lagos when left out. */
  start_date: z.iso.date().optional(),
});
export type SearchBody = z.input<typeof searchBodySchema>;
export type SearchInput = z.output<typeof searchBodySchema>;

const amountSchema = koboSchema.nonnegative();

export const searchResultSchema = z.strictObject({
  provider: publicProviderSchema,
  /** Straight-line distance, to 0.1 km. */
  distance_km: z.number().nonnegative(),
  available_quantity: z.number().nonnegative(),
  storage_subtotal_kobo: amountSchema,
  service_fee_kobo: amountSchema,
  /** Storage subtotal plus the service fee: what the farmer pays in all, before delivery. */
  total_estimate_kobo: amountSchema,
  /** Paid online when booking; the rest of the subtotal is paid at the facility. */
  deposit_kobo: amountSchema,
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.strictObject({
  data: z.array(searchResultSchema),
  /** True when nothing was found within the default radius and the search was retried wider. */
  expanded_radius: z.boolean(),
  radius_km: z.number().positive(),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
