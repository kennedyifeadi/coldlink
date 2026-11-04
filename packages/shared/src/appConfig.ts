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
