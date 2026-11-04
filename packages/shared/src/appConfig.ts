import * as z from 'zod';
import { koboSchema } from './money.js';
import { rateSchema } from './pricing.js';

// The keys and meanings in PRD 5.15. Values live in the app_config table, never in code (PRD 0.2).
const minutesSchema = z.int('Must be a whole number of minutes').positive('Must be at least 1');
const hoursSchema = z.int('Must be a whole number of hours').nonnegative('Must be 0 or more');
const radiusSchema = z.number().positive('Must be greater than 0');
const feeSchema = koboSchema.nonnegative('Must be 0 or more');

export const appConfigSchema = z
  .object({
    commission_rate: rateSchema,
    service_fee_kobo: feeSchema,
    deposit_percent: rateSchema,
    provider_response_minutes: minutesSchema,
    payment_hold_minutes: minutesSchema,
    search_default_radius_km: radiusSchema,
    search_max_radius_km: radiusSchema,
    delivery_base_fee_kobo: feeSchema,
    delivery_per_km_kobo: feeSchema,
    delivery_min_fee_kobo: feeSchema,
    delivery_partner_share: rateSchema,
    road_distance_factor: z.number().min(1, 'Must be 1 or more'),
    require_provider_approval: z.boolean(),
    otp_required: z.boolean(),
    farmer_free_cancel_hours: hoursSchema,
  })
  .refine((config) => config.deposit_percent > config.commission_rate, {
    path: ['deposit_percent'],
    message: 'deposit_percent must be greater than commission_rate',
  })
  .refine((config) => config.search_default_radius_km <= config.search_max_radius_km, {
    path: ['search_default_radius_km'],
    message: 'search_default_radius_km cannot be more than search_max_radius_km',
  });

export type AppConfig = z.infer<typeof appConfigSchema>;
export type AppConfigKey = keyof AppConfig;

export const appConfigKeys = Object.keys(appConfigSchema.shape) as AppConfigKey[];

// The keys GET /config/public returns. A key not listed here is private, so a new app_config key
// never reaches clients unless it is added on purpose (decision 48).
const { shape } = appConfigSchema;
export const publicConfigSchema = z.strictObject({
  search_default_radius_km: shape.search_default_radius_km,
  search_max_radius_km: shape.search_max_radius_km,
  service_fee_kobo: shape.service_fee_kobo,
  deposit_percent: shape.deposit_percent,
  farmer_free_cancel_hours: shape.farmer_free_cancel_hours,
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;

export const publicConfigKeys = Object.keys(publicConfigSchema.shape) as (keyof PublicConfig)[];

export function toPublicConfig(config: AppConfig): PublicConfig {
  return Object.fromEntries(publicConfigKeys.map((key) => [key, config[key]])) as PublicConfig;
}
