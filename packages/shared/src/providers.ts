import * as z from 'zod';
import { toScaledInteger } from './decimal.js';
import {
  backupPowerSchema,
  capacityUnitSchema,
  facilityTypeSchema,
  verificationStatusSchema,
} from './enums.js';
import { koboSchema } from './money.js';
import { phoneSchema } from './phone.js';
import { cropCategorySchema } from './referenceData.js';

// Request and response bodies of the provider endpoints (PRD 5.3, 7.2, 8).

/** PRD 7.2; the database holds the same limit (`providers_photos_max`). */
export const MAX_PROVIDER_PHOTOS = 4;
export const MAX_PROVIDER_PHOTO_BYTES = 5 * 1024 * 1024;
export const providerPhotoTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type ProviderPhotoType = keyof typeof providerPhotoTypes;

const CAPACITY_SCALE = 1000;

function text(max: number, message: string) {
  return z.string().trim().min(1, message).max(max);
}

const optionalText = (max: number, message: string) => text(max, message).nullable().optional();

// Quantities have at most 3 decimal places (decision 17), so capacity does too.
const capacitySchema = z
  .number()
  .positive('Enter a capacity above 0')
  .refine((value) => toScaledInteger(value, CAPACITY_SCALE) !== undefined, {
    message: 'Use at most 3 decimal places',
  });

const temperatureSchema = z.number().min(-40).max(40).nullable().optional();

const categoryIdsSchema = z
  .array(z.uuid())
  .min(1, 'Pick at least one kind of produce you can store')
  .refine((ids) => new Set(ids).size === ids.length, { message: 'List each category once' });

const providerFields = {
  business_name: optionalText(120, 'Enter the business name'),
  display_name: text(80, 'Enter the name farmers will see'),
  facility_type: facilityTypeSchema,
  description: optionalText(1000, 'Enter a description'),
  whatsapp: phoneSchema.nullable().optional(),
  address_text: text(200, 'Enter the address'),
  landmark: optionalText(120, 'Enter a landmark'),
  lga: optionalText(60, 'Enter the LGA'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  capacity_total: capacitySchema,
  capacity_unit: capacityUnitSchema,
  price_per_unit_per_day_kobo: koboSchema.positive('Enter a price above 0'),
  min_storage_days: z.int().min(1).max(365).optional(),
  temp_min_c: temperatureSchema,
  temp_max_c: temperatureSchema,
  has_backup_power: backupPowerSchema.optional(),
  category_ids: categoryIdsSchema,
};

function temperaturesInOrder(body: { temp_min_c?: number | null; temp_max_c?: number | null }) {
  const { temp_min_c: min, temp_max_c: max } = body;
  return min === undefined || min === null || max === undefined || max === null || min <= max;
}

const temperatureOrder = {
  path: ['temp_max_c'],
  message: 'The highest temperature must not be below the lowest',
};

export const createProviderBodySchema = z
  .strictObject({
    ...providerFields,
    // The number booking SMS go to; the owner's own number when left out.
    phone: phoneSchema.optional(),
  })
  .refine(temperaturesInOrder, temperatureOrder);
export type CreateProviderBody = z.input<typeof createProviderBodySchema>;
export type CreateProviderInput = z.output<typeof createProviderBodySchema>;

export const updateProviderBodySchema = z
  .strictObject({
    business_name: providerFields.business_name,
    display_name: providerFields.display_name.optional(),
    facility_type: providerFields.facility_type.optional(),
    description: providerFields.description,
    phone: phoneSchema.optional(),
    whatsapp: providerFields.whatsapp,
    address_text: providerFields.address_text.optional(),
    landmark: providerFields.landmark,
    lga: providerFields.lga,
    lat: providerFields.lat.optional(),
    lng: providerFields.lng.optional(),
    capacity_total: providerFields.capacity_total.optional(),
    capacity_unit: providerFields.capacity_unit.optional(),
    price_per_unit_per_day_kobo: providerFields.price_per_unit_per_day_kobo.optional(),
    min_storage_days: providerFields.min_storage_days,
    temp_min_c: providerFields.temp_min_c,
    temp_max_c: providerFields.temp_max_c,
    has_backup_power: providerFields.has_backup_power,
    is_accepting_bookings: z.boolean().optional(),
    category_ids: categoryIdsSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change' })
  .refine((body) => (body.lat === undefined) === (body.lng === undefined), {
    path: ['lng'],
    message: 'Send lat and lng together',
  })
  .refine(temperaturesInOrder, temperatureOrder);
export type UpdateProviderBody = z.input<typeof updateProviderBodySchema>;
export type UpdateProviderInput = z.output<typeof updateProviderBodySchema>;

/** A photo's id is its file name in storage: a random UUID and the extension of its type. */
export const providerPhotoIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/);

export const providerPhotoSchema = z.strictObject({
  id: providerPhotoIdSchema,
  url: z.url(),
});
export type ProviderPhoto = z.infer<typeof providerPhotoSchema>;

/** What anyone may see of an approved provider: no phone numbers, owner or moderation fields. */
export const publicProviderSchema = z.strictObject({
  id: z.uuid(),
  display_name: z.string(),
  business_name: z.string().nullable(),
  facility_type: facilityTypeSchema,
  description: z.string().nullable(),
  address_text: z.string(),
  landmark: z.string().nullable(),
  lga: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  capacity_total: z.number().positive(),
  capacity_unit: capacityUnitSchema,
  price_per_unit_per_day_kobo: koboSchema.positive(),
  min_storage_days: z.int().min(1),
  temp_min_c: z.number().nullable(),
  temp_max_c: z.number().nullable(),
  has_backup_power: backupPowerSchema,
  is_accepting_bookings: z.boolean(),
  avg_rating: z.number().min(0).max(5),
  rating_count: z.int().min(0),
  photos: z.array(providerPhotoSchema).max(MAX_PROVIDER_PHOTOS),
  categories: z.array(cropCategorySchema),
});
export type PublicProvider = z.infer<typeof publicProviderSchema>;

const maskedPhoneSchema = z.string().regex(/^\+234\d{3}\*{3}\d{4}$/);

/** The owner's and admins' view. Phone numbers are masked, as on the profile (decision 61). */
export const ownProviderSchema = z.strictObject({
  ...publicProviderSchema.shape,
  phone_masked: maskedPhoneSchema,
  whatsapp_masked: maskedPhoneSchema.nullable(),
  verification_status: verificationStatusSchema,
  verified_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type OwnProvider = z.infer<typeof ownProviderSchema>;

export const ownProvidersResponseSchema = z.strictObject({
  data: z.array(ownProviderSchema),
});
export type OwnProvidersResponse = z.infer<typeof ownProvidersResponseSchema>;
