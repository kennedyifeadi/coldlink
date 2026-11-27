import * as z from 'zod';
import { bookingCodeSchema } from './bookings.js';
import { handoverCodeSchema } from './deliveries.js';
import { deliveryDirectionSchema } from './deliveryPricing.js';
import { capacityUnitSchema, deliveryStatusSchema, vehicleTypeSchema } from './enums.js';
import { koboSchema } from './money.js';
import { e164PhoneSchema } from './phone.js';

// The delivery partner's SMS link pages and the admin's assignment (PRD 7.7 steps 4 and 5;
// decisions 147 to 155).

/**
 * The web app's page a partner's SMS link opens, kept short as the provider's `/a/:token` is
 * (decision 104). One page serves both the accept link and the update link.
 */
export const DELIVERY_ACTION_ROUTE = '/d/:token';

export function deliveryActionPath(token: string): string {
  return DELIVERY_ACTION_ROUTE.replace(':token', () => token);
}

/** Wrong handover codes the update link takes before it stops taking codes (decision 150). */
export const HANDOVER_CODE_MAX_ATTEMPTS = 5;

/** `accept` answers the job; `update` marks it picked up, then delivered (decision 149). */
export const partnerDeliveryLinkKinds = ['accept', 'update'] as const;
export type PartnerDeliveryLinkKind = (typeof partnerDeliveryLinkKinds)[number];

/**
 * What the partner sees of a job (decision 151). The farmer's end of the trip and the contact are
 * null until the partner has accepted, and again once the job is over. Never the farmer's fee,
 * ColdLink's margin, the handover code or anything about the booking's money.
 */
export const partnerDeliveryJobSchema = z.strictObject({
  booking_code: bookingCodeSchema,
  direction: deliveryDirectionSchema,
  status: deliveryStatusSchema,
  /** A day on the Lagos calendar; the partner arranges the hour. */
  scheduled_for: z.iso.date(),
  /** The facility's end: pickup for an outbound delivery, drop-off for an inbound one. */
  facility: z.strictObject({
    name: z.string(),
    lga: z.string().nullable(),
    address: z.string().nullable(),
  }),
  /** The farmer's end, as the farmer described it to the driver. */
  farmer_address: z.string().nullable(),
  /** The person at the farmer's end, in full so the driver can call. */
  contact: z.strictObject({ name: z.string().nullable(), phone: e164PhoneSchema }).nullable(),
  load_description: z.string(),
  load_quantity: z.number().positive(),
  load_unit: capacityUnitSchema,
  vehicle_type: vehicleTypeSchema,
  distance_km: z.number().nonnegative(),
  /** What ColdLink pays the partner for the job. */
  payout_kobo: koboSchema.nonnegative(),
  handover_attempts_left: z.int().min(0).max(HANDOVER_CODE_MAX_ATTEMPTS),
});
export type PartnerDeliveryJob = z.infer<typeof partnerDeliveryJobSchema>;

export const partnerDeliveryLinkSchema = z.strictObject({
  link: z.enum(partnerDeliveryLinkKinds),
  job: partnerDeliveryJobSchema,
});
export type PartnerDeliveryLink = z.infer<typeof partnerDeliveryLinkSchema>;

export const partnerDeliveryActions = ['accept', 'decline', 'picked_up', 'delivered'] as const;
export type PartnerDeliveryAction = (typeof partnerDeliveryActions)[number];

export const partnerDeliveryActionBodySchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('accept') }),
  z.strictObject({ action: z.literal('decline') }),
  z.strictObject({ action: z.literal('picked_up') }),
  z.strictObject({ action: z.literal('delivered'), handover_code: handoverCodeSchema }),
]);
export type PartnerDeliveryActionBody = z.infer<typeof partnerDeliveryActionBodySchema>;

/** The job after the move, or null once declined, since the partner no longer has it. */
export const partnerDeliveryActionResultSchema = z.strictObject({
  outcome: z.enum(['accepted', 'declined', 'picked_up', 'delivered']),
  job: partnerDeliveryJobSchema.nullable(),
});
export type PartnerDeliveryActionResult = z.infer<typeof partnerDeliveryActionResultSchema>;

/** `details` of a 400 `handover_code_invalid`: 0 means the link takes no more codes. */
export const handoverCodeInvalidDetailsSchema = z.object({
  handover_attempts_left: z
    .int()
    .min(0)
    .max(HANDOVER_CODE_MAX_ATTEMPTS - 1),
});

export const assignDeliveryBodySchema = z.strictObject({ partner_id: z.uuid() });
export type AssignDeliveryBody = z.infer<typeof assignDeliveryBodySchema>;

const timestamp = z.iso.datetime().nullable();

/**
 * The admin's view of a delivery, as the assignment answers it; #46's queue builds on it. The
 * contact number is masked (decision 61) and the handover code is not in it.
 */
export const adminDeliverySchema = z.strictObject({
  id: z.uuid(),
  booking_id: z.uuid(),
  booking_code: bookingCodeSchema,
  direction: deliveryDirectionSchema,
  status: deliveryStatusSchema,
  paid: z.boolean(),
  pickup_text: z.string(),
  dropoff_text: z.string(),
  contact_name: z.string().nullable(),
  contact_phone_masked: z.string(),
  load_description: z.string(),
  load_quantity: z.number().positive(),
  load_unit: capacityUnitSchema,
  vehicle_type: vehicleTypeSchema,
  distance_km: z.number().nonnegative(),
  fee_kobo: koboSchema.positive(),
  partner_payout_kobo: koboSchema.nonnegative(),
  platform_margin_kobo: koboSchema.nonnegative(),
  scheduled_for: z.iso.date(),
  assigned_at: timestamp,
  picked_up_at: timestamp,
  delivered_at: timestamp,
  handover_failed_attempts: z.int().nonnegative(),
  /**
   * `covers_facility_lga` is false when the partner lists coverage LGAs and the facility's is not
   * among them: a warning, not a refusal (decision 153).
   */
  partner: z
    .strictObject({ id: z.uuid(), company_name: z.string(), covers_facility_lga: z.boolean() })
    .nullable(),
});
export type AdminDelivery = z.infer<typeof adminDeliverySchema>;
