import * as z from 'zod';
import { deliveryDirectionSchema } from './deliveryPricing.js';
import { capacityUnitSchema, deliveryStatusSchema, vehicleTypeSchema } from './enums.js';
import { koboSchema } from './money.js';
import { phoneSchema } from './phone.js';
import { pricingInputSchema } from './pricing.js';

// Request and response bodies of the delivery endpoints (PRD 7.7, 8; decision 146). A request
// names the farmer's end of the trip: where the load is picked up for an inbound delivery, and
// where it is dropped off for an outbound one. The facility is always the other end.

export const deliveryLocationSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type DeliveryLocation = z.infer<typeof deliveryLocationSchema>;

const loadShape = {
  load_quantity: pricingInputSchema.shape.quantity,
  load_unit: capacityUnitSchema,
};

const cratesAreWhole = {
  check: (body: { load_quantity: number; load_unit: string }) =>
    body.load_unit !== 'crates' || Number.isInteger(body.load_quantity),
  params: { path: ['load_quantity'], message: 'Crates must be a whole number' },
};

/** What a quote needs of a delivery: where the farmer is and how big the load is. */
export const deliveryLoadSchema = z
  .strictObject({ location: deliveryLocationSchema, ...loadShape })
  .refine(cratesAreWhole.check, cratesAreWhole.params);
export type DeliveryLoad = z.infer<typeof deliveryLoadSchema>;

/**
 * Quotes a delivery for an existing booking (`booking_id`, the caller's own), or an inbound one for
 * a booking not yet made at a facility (`provider_id`, with the booking's `start_date`, today in
 * Lagos when left out).
 */
export const deliveryQuoteBodySchema = z
  .strictObject({
    direction: deliveryDirectionSchema,
    booking_id: z.uuid().optional(),
    provider_id: z.uuid().optional(),
    start_date: z.iso.date().optional(),
    location: deliveryLocationSchema,
    ...loadShape,
  })
  .refine((body) => (body.booking_id === undefined) !== (body.provider_id === undefined), {
    path: ['booking_id'],
    message: 'Give either booking_id or provider_id',
  })
  .refine((body) => body.provider_id === undefined || body.direction === 'inbound', {
    path: ['direction'],
    message: 'Only an inbound delivery can be quoted before booking',
  })
  .refine((body) => body.start_date === undefined || body.provider_id !== undefined, {
    path: ['start_date'],
    message: 'start_date is only for a quote with provider_id',
  })
  .refine(cratesAreWhole.check, cratesAreWhole.params);
export type DeliveryQuoteBody = z.input<typeof deliveryQuoteBodySchema>;
export type DeliveryQuoteInput = z.output<typeof deliveryQuoteBodySchema>;

const amountSchema = koboSchema.nonnegative();

/** The farmer's price for a delivery; the partner's payout and ColdLink's margin are never shown. */
export const deliveryQuoteSchema = z.strictObject({
  direction: deliveryDirectionSchema,
  /** Estimated road distance, to 0.1 km. */
  distance_km: z.number().nonnegative(),
  vehicle_type: vehicleTypeSchema,
  fee_kobo: koboSchema.positive(),
  /** The first and last days `scheduled_for` may be, both included, on the Lagos calendar. */
  earliest_date: z.iso.date(),
  latest_date: z.iso.date(),
});
export type DeliveryQuote = z.infer<typeof deliveryQuoteSchema>;

const text = (max: number, label: string) =>
  z.string().trim().min(1, `Enter the ${label}`).max(max, `Keep it to ${max} characters`);

/** A delivery as the farmer asks for it; the fee, distance and vehicle are worked out by the API. */
export const deliveryDetailsSchema = z
  .strictObject({
    /** The farmer's end of the trip, as they describe it to the driver. */
    address_text: text(300, 'address'),
    location: deliveryLocationSchema,
    /** The person at the farmer's end. */
    contact_phone: phoneSchema,
    contact_name: text(100, 'name').optional(),
    load_description: text(300, 'load'),
    ...loadShape,
    /** A day in Lagos inside the booking's delivery window. */
    scheduled_for: z.iso.date(),
  })
  .refine(cratesAreWhole.check, cratesAreWhole.params);
export type DeliveryDetailsBody = z.input<typeof deliveryDetailsSchema>;
export type DeliveryDetails = z.output<typeof deliveryDetailsSchema>;

export const createDeliveryBodySchema = z
  .strictObject({
    booking_id: z.uuid(),
    direction: deliveryDirectionSchema,
    ...deliveryDetailsSchema.shape,
  })
  .refine(cratesAreWhole.check, cratesAreWhole.params);
export type CreateDeliveryBody = z.input<typeof createDeliveryBodySchema>;
export type CreateDeliveryInput = z.output<typeof createDeliveryBodySchema>;

export const handoverCodeSchema = z.string().regex(/^[0-9]{4}$/);

/** What cancelling now would refund; the API works it out, so the client does no arithmetic. */
export const deliveryCancellationPreviewSchema = z.discriminatedUnion('allowed', [
  z.strictObject({ allowed: z.literal(false) }),
  z.strictObject({ allowed: z.literal(true), refund_kobo: amountSchema }),
]);
export type DeliveryCancellationPreview = z.infer<typeof deliveryCancellationPreviewSchema>;

const timestamp = z.iso.datetime().nullable();

/**
 * The farmer's view of their delivery. Never the partner's payout or ColdLink's margin, and the
 * contact number only masked (decision 61).
 */
export const farmerDeliverySchema = z.strictObject({
  id: z.uuid(),
  booking_id: z.uuid(),
  direction: deliveryDirectionSchema,
  status: deliveryStatusSchema,
  /** True once the fee is paid: with the booking, or through its own charge. */
  paid: z.boolean(),
  pickup_text: z.string(),
  pickup_location: deliveryLocationSchema,
  dropoff_text: z.string(),
  dropoff_location: deliveryLocationSchema,
  contact_name: z.string().nullable(),
  contact_phone_masked: z.string(),
  load_description: z.string(),
  load_quantity: z.number().positive(),
  load_unit: capacityUnitSchema,
  distance_km: z.number().nonnegative(),
  vehicle_type: vehicleTypeSchema,
  fee_kobo: koboSchema.positive(),
  scheduled_for: z.iso.date(),
  /** The farmer gives it to the person receiving the load, who tells it to the driver. */
  handover_code: handoverCodeSchema,
  assigned_at: timestamp,
  picked_up_at: timestamp,
  delivered_at: timestamp,
  created_at: z.iso.datetime(),
  cancellation: deliveryCancellationPreviewSchema,
});
export type FarmerDelivery = z.infer<typeof farmerDeliverySchema>;

export const cancelledDeliverySchema = z.strictObject({
  ...farmerDeliverySchema.shape,
  /** What the cancellation refunds: the whole fee if it was paid, otherwise 0. */
  refund_kobo: amountSchema,
});
export type CancelledDelivery = z.infer<typeof cancelledDeliverySchema>;
