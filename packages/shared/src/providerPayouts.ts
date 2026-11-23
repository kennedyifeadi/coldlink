import * as z from 'zod';
import { bookingCodeSchema } from './bookings.js';
import { payoutStatusSchema } from './enums.js';
import { koboSchema } from './money.js';
import { providerEarningsSchema } from './providerDashboard.js';

// The facility's payouts, for its earnings screen (PRD 5.8, 7.2, 9.5). Never who recorded a
// payment, and nothing about the farmer (PRD 10).

export const PROVIDER_PAYOUTS_DEFAULT_LIMIT = 20;
export const PROVIDER_PAYOUTS_MAX_LIMIT = 50;

export const providerPayoutsQuerySchema = z.strictObject({
  status: payoutStatusSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PROVIDER_PAYOUTS_MAX_LIMIT)
    .default(PROVIDER_PAYOUTS_DEFAULT_LIMIT),
  /** The `next_cursor` of the page before: the id of its last payout. */
  cursor: z.uuid().optional(),
});
export type ProviderPayoutsQuery = z.input<typeof providerPayoutsQuerySchema>;
export type ProviderPayoutsQueryInput = z.output<typeof providerPayoutsQuerySchema>;

export const providerPayoutSchema = z
  .strictObject({
    id: z.uuid(),
    amount_kobo: koboSchema.positive(),
    status: payoutStatusSchema,
    /** When the produce was checked in and the payout became owed (PRD 6.4). */
    created_at: z.iso.datetime(),
    paid_at: z.iso.datetime().nullable(),
    /** The transfer's reference, recorded with the payment. */
    reference: z.string().nullable(),
    booking: z.strictObject({
      id: z.uuid(),
      code: bookingCodeSchema,
      crop: z.strictObject({ id: z.uuid(), name: z.string() }),
      start_date: z.iso.date(),
      duration_days: z.int().positive(),
      end_date: z.iso.date(),
    }),
  })
  .refine(
    (payout) =>
      payout.status === 'paid'
        ? payout.paid_at !== null && payout.reference !== null
        : payout.paid_at === null && payout.reference === null,
    { message: 'A paid payout has its date and reference, an owed one neither' },
  );
export type ProviderPayout = z.infer<typeof providerPayoutSchema>;

export const providerPayoutsResponseSchema = z.strictObject({
  data: z.array(providerPayoutSchema),
  /** Null on the last page. */
  next_cursor: z.uuid().nullable(),
  /** Every payout of the facility, whatever the status filter. */
  earnings: providerEarningsSchema,
});
export type ProviderPayoutsResponse = z.infer<typeof providerPayoutsResponseSchema>;
