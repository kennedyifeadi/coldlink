import * as z from 'zod';
import { bookingCodeSchema, cancelBookingBodySchema } from './bookings.js';
import { bookingStatusSchema, capacityUnitSchema } from './enums.js';
import { koboSchema } from './money.js';

// Request and response bodies of the provider's booking actions and the SMS action link
// (PRD 5.13, 7.2, 7.6).

/** The same optional reason a farmer may give when cancelling. */
export const rejectBookingBodySchema = cancelBookingBodySchema;
export type RejectBookingBody = z.input<typeof rejectBookingBodySchema>;
export type RejectBookingInput = z.output<typeof rejectBookingBodySchema>;

const amountSchema = koboSchema.nonnegative();

// What the facility is owed and collects; never the farmer's phone or name (PRD 10).
export const providerBookingSchema = z.strictObject({
  id: z.uuid(),
  code: bookingCodeSchema,
  status: bookingStatusSchema,
  provider: z.strictObject({ id: z.uuid(), display_name: z.string() }),
  crop: z.strictObject({ id: z.uuid(), name: z.string() }),
  quantity: z.number().positive(),
  capacity_unit: capacityUnitSchema,
  start_date: z.iso.date(),
  duration_days: z.int().positive(),
  end_date: z.iso.date(),
  /** Paid by the farmer at the facility. */
  balance_due_kobo: amountSchema,
  /** What ColdLink pays the facility after check-in: the deposit less the commission (PRD 6.1). */
  payout_kobo: amountSchema,
  provider_response_due_at: z.iso.datetime().nullable(),
  checked_in_at: z.iso.datetime().nullable(),
  collected_at: z.iso.datetime().nullable(),
});
export type ProviderBooking = z.infer<typeof providerBookingSchema>;

export const providerLinkActions = ['accept', 'reject'] as const;
export type ProviderLinkAction = (typeof providerLinkActions)[number];

export const providerLinkActionBodySchema = z.strictObject({
  action: z.enum(providerLinkActions),
});
export type ProviderLinkActionBody = z.infer<typeof providerLinkActionBodySchema>;

/** Only what the provider needs to decide from the SMS link. */
export const providerBookingRequestSchema = z.strictObject({
  facility_name: z.string(),
  crop_name: z.string(),
  quantity: z.number().positive(),
  capacity_unit: capacityUnitSchema,
  start_date: z.iso.date(),
  duration_days: z.int().positive(),
  end_date: z.iso.date(),
  payout_kobo: amountSchema,
});
export type ProviderBookingRequest = z.infer<typeof providerBookingRequestSchema>;

export const providerLinkActionResultSchema = z.strictObject({
  status: z.enum(['confirmed', 'rejected']),
});
export type ProviderLinkActionResult = z.infer<typeof providerLinkActionResultSchema>;

/**
 * The web app's page that an SMS action link opens (decision 104), kept short because it rides in
 * every booking_received SMS. The web route is `/a/:token`.
 */
export const PROVIDER_ACTION_ROUTE = '/a/:token';

export function providerActionPath(token: string): string {
  return PROVIDER_ACTION_ROUTE.replace(':token', () => token);
}
