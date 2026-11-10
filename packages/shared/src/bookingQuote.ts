import * as z from 'zod';
import { capacityUnitSchema } from './enums.js';
import { koboSchema } from './money.js';
import { pricingInputSchema } from './pricing.js';
import { MAX_SEARCH_DAYS } from './search.js';

// Request and response bodies of POST /bookings/quote (PRD 6.1, 8).

export const bookingQuoteBodySchema = z
  .strictObject({
    provider_id: z.uuid(),
    // In the facility's unit, which the client states so a quote is never read in the wrong one
    // (decision 71).
    quantity: pricingInputSchema.shape.quantity,
    capacity_unit: capacityUnitSchema,
    days: pricingInputSchema.shape.duration_days.max(MAX_SEARCH_DAYS),
    /** Today in Africa/Lagos when left out. */
    start_date: z.iso.date().optional(),
  })
  .refine((body) => body.capacity_unit !== 'crates' || Number.isInteger(body.quantity), {
    path: ['quantity'],
    message: 'Crates must be a whole number',
  });
export type BookingQuoteBody = z.input<typeof bookingQuoteBodySchema>;
export type BookingQuoteInput = z.output<typeof bookingQuoteBodySchema>;

const amountSchema = koboSchema.nonnegative();

// Named as the `bookings` columns (decision 18). The commission and payout are left out: they are
// the platform's margin, not the farmer's price (decision 48).
export const bookingQuoteSchema = z.strictObject({
  provider_id: z.uuid(),
  quantity: z.number().positive(),
  capacity_unit: capacityUnitSchema,
  start_date: z.iso.date(),
  duration_days: z.int().positive(),
  /** The day the produce is collected: start date plus the days. */
  end_date: z.iso.date(),
  /** Free on the busiest day of the period, in `capacity_unit`. */
  available_quantity: z.number().nonnegative(),
  unit_price_kobo: koboSchema.positive(),
  storage_subtotal_kobo: amountSchema,
  /** Paid online when booking. */
  deposit_kobo: amountSchema,
  /** The rest of the subtotal, paid at the facility. */
  balance_due_kobo: amountSchema,
  service_fee_kobo: amountSchema,
  /** Always 0 until delivery can be requested with a booking. */
  delivery_fee_kobo: amountSchema,
  /** Deposit plus service fee plus delivery fee: what the farmer pays now. */
  total_charged_online_kobo: amountSchema,
});
export type BookingQuote = z.infer<typeof bookingQuoteSchema>;
