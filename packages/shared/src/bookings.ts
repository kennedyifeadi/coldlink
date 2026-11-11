import * as z from 'zod';
import { bookingQuoteBodySchema } from './bookingQuote.js';
import { bookingStatusSchema, cancelledBySchema, capacityUnitSchema } from './enums.js';
import { koboSchema } from './money.js';

// Request and response bodies of the farmer's booking endpoints (PRD 5.5, 8).

/** CL- and 5 characters from an alphabet without 0, O, 1 and I, as the database checks. */
export const BOOKING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const BOOKING_CODE_LENGTH = 5;
export const bookingCodeSchema = z.string().regex(/^CL-[A-HJ-NP-Z2-9]{5}$/);

/** The quote's terms, and the crop being stored. */
export const createBookingBodySchema = bookingQuoteBodySchema.safeExtend({
  crop_id: z.uuid(),
});
export type CreateBookingBody = z.input<typeof createBookingBodySchema>;
export type CreateBookingInput = z.output<typeof createBookingBodySchema>;

export const cancelBookingBodySchema = z.strictObject({
  reason: z.string().trim().min(1, 'Enter a reason or leave it out').max(500).optional(),
});
export type CancelBookingBody = z.input<typeof cancelBookingBodySchema>;
export type CancelBookingInput = z.output<typeof cancelBookingBodySchema>;

const amountSchema = koboSchema.nonnegative();

// Named as the `bookings` columns (decision 18). The farmer never sees the commission, its rate or
// the provider's payout (decision 48).
export const farmerBookingSummarySchema = z.strictObject({
  id: z.uuid(),
  code: bookingCodeSchema,
  status: bookingStatusSchema,
  provider: z.strictObject({
    id: z.uuid(),
    display_name: z.string(),
    lga: z.string().nullable(),
  }),
  crop: z.strictObject({
    id: z.uuid(),
    name: z.string(),
  }),
  quantity: z.number().positive(),
  capacity_unit: capacityUnitSchema,
  start_date: z.iso.date(),
  duration_days: z.int().positive(),
  /** The day the produce is collected: start date plus the days. */
  end_date: z.iso.date(),
  /** Deposit plus service fee plus delivery fee: what the farmer pays online. */
  total_charged_online_kobo: amountSchema,
  /** The rest of the subtotal, paid at the facility. */
  balance_due_kobo: amountSchema,
  created_at: z.iso.datetime(),
});
export type FarmerBookingSummary = z.infer<typeof farmerBookingSummarySchema>;

export const farmerBookingSchema = z.strictObject({
  ...farmerBookingSummarySchema.shape,
  provider: z.strictObject({
    ...farmerBookingSummarySchema.shape.provider.shape,
    address_text: z.string(),
    landmark: z.string().nullable(),
  }),
  unit_price_kobo: koboSchema.positive(),
  storage_subtotal_kobo: amountSchema,
  service_fee_kobo: amountSchema,
  deposit_kobo: amountSchema,
  /** Always 0 until delivery can be requested with a booking. */
  delivery_fee_kobo: amountSchema,
  /** Until then the booking holds the space while it waits for payment. */
  payment_expires_at: z.iso.datetime().nullable(),
  provider_response_due_at: z.iso.datetime().nullable(),
  checked_in_at: z.iso.datetime().nullable(),
  collected_at: z.iso.datetime().nullable(),
  cancelled_by: cancelledBySchema.nullable(),
  cancel_reason: z.string().nullable(),
});
export type FarmerBooking = z.infer<typeof farmerBookingSchema>;

export const farmerBookingsResponseSchema = z.strictObject({
  data: z.array(farmerBookingSummarySchema),
});
export type FarmerBookingsResponse = z.infer<typeof farmerBookingsResponseSchema>;

export const cancelledBookingSchema = z.strictObject({
  ...farmerBookingSchema.shape,
  /** What the cancellation policy refunds of the online payment (PRD 6.6). */
  refund_kobo: amountSchema,
});
export type CancelledBooking = z.infer<typeof cancelledBookingSchema>;
