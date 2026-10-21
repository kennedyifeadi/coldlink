import * as z from 'zod';
import { toScaledInteger } from './decimal.js';
import { koboSchema } from './money.js';

// Quantities have at most 3 decimal places and rates are whole basis points, so pricing runs on
// exact integers. The rounding rule is decision 17.
const QUANTITY_SCALE = 1000;
const BASIS_POINTS = 10_000;

const fitsScale = (scale: number) => (value: number) => toScaledInteger(value, scale) !== undefined;

const rateSchema = z
  .number()
  .min(0, 'Must be 0 or more')
  .max(1, 'Must be 1 or less')
  .refine(fitsScale(BASIS_POINTS), 'Must have at most 4 decimal places (whole basis points)');

export const pricingInputSchema = z
  .object({
    quantity: z
      .number()
      .positive('Must be greater than 0')
      .refine(fitsScale(QUANTITY_SCALE), 'Must have at most 3 decimal places'),
    duration_days: z.int('Must be a whole number of days').positive('Must be at least 1 day'),
    unit_price_kobo: koboSchema.positive('Must be greater than 0'),
    commission_rate: rateSchema,
    deposit_percent: rateSchema,
    service_fee_kobo: koboSchema.nonnegative('Must be 0 or more'),
    delivery_fee_kobo: koboSchema.nonnegative('Must be 0 or more').default(0),
    delivery_margin_kobo: koboSchema.nonnegative('Must be 0 or more').default(0),
  })
  .refine((input) => input.deposit_percent > input.commission_rate, {
    path: ['deposit_percent'],
    message: 'deposit_percent must be greater than commission_rate',
  })
  .refine((input) => input.delivery_margin_kobo <= input.delivery_fee_kobo, {
    path: ['delivery_margin_kobo'],
    message: 'delivery_margin_kobo cannot be more than delivery_fee_kobo',
  });

const amountSchema = koboSchema.nonnegative();

export const pricingBreakdownSchema = z.object({
  storage_subtotal_kobo: amountSchema,
  commission_kobo: amountSchema,
  service_fee_kobo: amountSchema,
  deposit_kobo: amountSchema,
  balance_due_kobo: amountSchema,
  delivery_fee_kobo: amountSchema,
  total_charged_online_kobo: amountSchema,
  provider_payout_kobo: amountSchema,
  platform_revenue_kobo: amountSchema,
});

export type PricingInput = z.input<typeof pricingInputSchema>;
export type PricingBreakdown = z.infer<typeof pricingBreakdownSchema>;

export type PricingErrorCode = 'invalid_input' | 'amount_out_of_range';

export class PricingError extends Error {
  override readonly name = 'PricingError';
  readonly code: PricingErrorCode;

  constructor(code: PricingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

// PRD 6.1.
export function calculatePricing(input: PricingInput): PricingBreakdown {
  const parsed = pricingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PricingError('invalid_input', z.prettifyError(parsed.error), {
      cause: parsed.error,
    });
  }
  const terms = parsed.data;

  const subtotal = divideRoundingHalfUp(
    toScaledBigInt(terms.quantity, QUANTITY_SCALE) *
      BigInt(terms.duration_days) *
      BigInt(terms.unit_price_kobo),
    BigInt(QUANTITY_SCALE),
  );
  const commission = applyRate(subtotal, terms.commission_rate);
  const deposit = applyRate(subtotal, terms.deposit_percent);
  const serviceFee = BigInt(terms.service_fee_kobo);
  const deliveryFee = BigInt(terms.delivery_fee_kobo);

  return {
    storage_subtotal_kobo: toKobo(subtotal),
    commission_kobo: toKobo(commission),
    service_fee_kobo: terms.service_fee_kobo,
    deposit_kobo: toKobo(deposit),
    balance_due_kobo: toKobo(subtotal - deposit),
    delivery_fee_kobo: terms.delivery_fee_kobo,
    total_charged_online_kobo: toKobo(deposit + serviceFee + deliveryFee),
    provider_payout_kobo: toKobo(deposit - commission),
    platform_revenue_kobo: toKobo(commission + serviceFee + BigInt(terms.delivery_margin_kobo)),
  };
}

function applyRate(amount: bigint, rate: number): bigint {
  return divideRoundingHalfUp(amount * toScaledBigInt(rate, BASIS_POINTS), BigInt(BASIS_POINTS));
}

// Only for values the schema has checked fit the scale, so the rounding only removes float error.
function toScaledBigInt(value: number, scale: number): bigint {
  return BigInt(Math.round(value * scale));
}

function divideRoundingHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function toKobo(amount: bigint): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PricingError('amount_out_of_range', `${amount} kobo is too large to represent`);
  }
  return Number(amount);
}
