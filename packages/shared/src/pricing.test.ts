import { describe, expect, it } from 'vitest';
import { calculatePricing, PricingError, type PricingInput } from './pricing.js';

// PRD 5.15 placeholders. Real values come from app_config.
const config = { commission_rate: 0.075, deposit_percent: 0.3, service_fee_kobo: 0 };

const workedExample: PricingInput = {
  quantity: 2,
  duration_days: 30,
  unit_price_kobo: 225_800,
  ...config,
};

function pricingError(input: PricingInput): PricingError {
  try {
    calculatePricing(input);
  } catch (error) {
    if (error instanceof PricingError) return error;
    throw error;
  }
  throw new Error('Expected calculatePricing to throw');
}

describe('calculatePricing', () => {
  it('matches the PRD 6.1 worked example', () => {
    expect(calculatePricing(workedExample)).toEqual({
      storage_subtotal_kobo: 13_548_000, // ₦135,480
      commission_kobo: 1_016_100, // ₦10,161
      service_fee_kobo: 0,
      deposit_kobo: 4_064_400, // ₦40,644
      balance_due_kobo: 9_483_600, // ₦94,836
      delivery_fee_kobo: 0,
      total_charged_online_kobo: 4_064_400,
      provider_payout_kobo: 3_048_300, // ₦30,483
      platform_revenue_kobo: 1_016_100,
    });
  });

  describe('service fee', () => {
    it('charges only the deposit online when the fee is 0', () => {
      const pricing = calculatePricing(workedExample);
      expect(pricing.total_charged_online_kobo).toBe(pricing.deposit_kobo);
      expect(pricing.platform_revenue_kobo).toBe(pricing.commission_kobo);
    });

    it('adds a non-zero fee to the online charge and platform revenue only', () => {
      expect(calculatePricing({ ...workedExample, service_fee_kobo: 10_000 })).toEqual({
        storage_subtotal_kobo: 13_548_000,
        commission_kobo: 1_016_100,
        service_fee_kobo: 10_000,
        deposit_kobo: 4_064_400,
        balance_due_kobo: 9_483_600,
        delivery_fee_kobo: 0,
        total_charged_online_kobo: 4_074_400,
        provider_payout_kobo: 3_048_300,
        platform_revenue_kobo: 1_026_100,
      });
    });
  });

  describe('rounding', () => {
    it('rounds a commission of exactly half a kobo up', () => {
      // 200 × 7.25% = 14.5 kobo; Math.round(200 * 0.0725) gives 14 because of float error.
      const pricing = calculatePricing({
        ...config,
        quantity: 1,
        duration_days: 1,
        unit_price_kobo: 200,
        commission_rate: 0.0725,
      });
      expect(pricing.commission_kobo).toBe(15);
      expect(pricing.deposit_kobo).toBe(60);
      expect(pricing.provider_payout_kobo).toBe(45);
    });

    it('rounds a deposit of exactly half a kobo up', () => {
      // 50 × 29% = 14.5 kobo; Math.round(50 * 0.29) gives 14 because of float error.
      const pricing = calculatePricing({
        ...config,
        quantity: 1,
        duration_days: 1,
        unit_price_kobo: 50,
        deposit_percent: 0.29,
      });
      expect(pricing.deposit_kobo).toBe(15);
      expect(pricing.balance_due_kobo).toBe(35);
    });

    it('rounds less than half a kobo down', () => {
      // 6 × 7.5% = 0.45 kobo; 6 × 30% = 1.8 kobo.
      const pricing = calculatePricing({
        ...config,
        quantity: 1,
        duration_days: 1,
        unit_price_kobo: 6,
      });
      expect(pricing.commission_kobo).toBe(0);
      expect(pricing.deposit_kobo).toBe(2);
      expect(pricing.provider_payout_kobo).toBe(2);
    });
  });

  describe('fractional quantity', () => {
    it('prices a fractional quantity exactly', () => {
      expect(calculatePricing({ ...workedExample, quantity: 1.5 })).toMatchObject({
        storage_subtotal_kobo: 10_161_000,
        commission_kobo: 762_075,
        deposit_kobo: 3_048_300,
        balance_due_kobo: 7_112_700,
        provider_payout_kobo: 2_286_225,
      });
    });

    it('rounds a fractional subtotal half up to whole kobo', () => {
      // 2.5 kg × 3 days × 333 kobo = 2,497.5 kobo.
      expect(
        calculatePricing({ ...config, quantity: 2.5, duration_days: 3, unit_price_kobo: 333 })
          .storage_subtotal_kobo,
      ).toBe(2498);
    });

    it('reads the quantity as the decimal it was written as', () => {
      // 1.005 × 100 = 100.5 kobo; the float product is 100.49999999999999.
      expect(
        calculatePricing({ ...config, quantity: 1.005, duration_days: 1, unit_price_kobo: 100 })
          .storage_subtotal_kobo,
      ).toBe(101);
    });
  });

  describe('delivery', () => {
    it('adds the delivery fee to the online charge and the margin to platform revenue', () => {
      expect(
        calculatePricing({
          ...workedExample,
          delivery_fee_kobo: 150_000,
          delivery_margin_kobo: 30_000,
        }),
      ).toMatchObject({
        deposit_kobo: 4_064_400,
        balance_due_kobo: 9_483_600,
        delivery_fee_kobo: 150_000,
        total_charged_online_kobo: 4_214_400,
        provider_payout_kobo: 3_048_300,
        platform_revenue_kobo: 1_046_100,
      });
    });
  });

  it('stays exact for a large booking', () => {
    // Before rounding, the subtotal is about 3.6 × 10^16 thousandths of a kobo: past 2^53.
    expect(
      calculatePricing({
        ...config,
        quantity: 99_999.999,
        duration_days: 365,
        unit_price_kobo: 999_999,
      }),
    ).toMatchObject({
      storage_subtotal_kobo: 36_499_963_135_000,
      commission_kobo: 2_737_497_235_125,
      deposit_kobo: 10_949_988_940_500,
      balance_due_kobo: 25_549_974_194_500,
      provider_payout_kobo: 8_212_491_705_375,
    });
  });

  it('keeps the parts adding up', () => {
    const ratePairs: [number, number][] = [
      [0, 0.0001],
      [0.075, 0.3],
      [0.0725, 0.29],
      [0.2, 0.35],
      [0.9999, 1],
    ];
    for (const quantity of [0.001, 0.5, 1, 1.005, 2.333, 17.25, 1000]) {
      for (const duration_days of [1, 7, 30, 365]) {
        for (const unit_price_kobo of [1, 99, 225_800, 1_234_567]) {
          for (const [commission_rate, deposit_percent] of ratePairs) {
            const pricing = calculatePricing({
              quantity,
              duration_days,
              unit_price_kobo,
              commission_rate,
              deposit_percent,
              service_fee_kobo: 10_000,
              delivery_fee_kobo: 150_000,
            });
            expect(pricing.deposit_kobo + pricing.balance_due_kobo).toBe(
              pricing.storage_subtotal_kobo,
            );
            expect(pricing.commission_kobo + pricing.provider_payout_kobo).toBe(
              pricing.deposit_kobo,
            );
            expect(pricing.provider_payout_kobo).toBeGreaterThanOrEqual(0);
            expect(pricing.total_charged_online_kobo).toBe(pricing.deposit_kobo + 160_000);
          }
        }
      }
    }
  });

  describe('validation', () => {
    it.each([
      { commission_rate: 0.075, deposit_percent: 0.075 },
      { commission_rate: 0.075, deposit_percent: 0.05 },
    ])(
      'rejects a deposit_percent of $deposit_percent with a commission_rate of $commission_rate',
      (rates) => {
        const error = pricingError({ ...workedExample, ...rates });
        expect(error.code).toBe('invalid_input');
        expect(error.message).toContain('deposit_percent must be greater than commission_rate');
      },
    );

    it.each<[string, Partial<PricingInput>]>([
      ['zero quantity', { quantity: 0 }],
      ['negative quantity', { quantity: -1 }],
      ['quantity with more than 3 decimal places', { quantity: 0.0005 }],
      ['infinite quantity', { quantity: Number.POSITIVE_INFINITY }],
      ['NaN quantity', { quantity: Number.NaN }],
      ['zero duration', { duration_days: 0 }],
      ['negative duration', { duration_days: -3 }],
      ['fractional duration', { duration_days: 1.5 }],
      ['zero unit price', { unit_price_kobo: 0 }],
      ['negative unit price', { unit_price_kobo: -100 }],
      ['unit price with a fraction of a kobo', { unit_price_kobo: 225.5 }],
      ['negative commission rate', { commission_rate: -0.01 }],
      ['rate finer than a basis point', { commission_rate: 0.07501 }],
      ['deposit over 100%', { deposit_percent: 1.2 }],
      ['negative service fee', { service_fee_kobo: -1 }],
      ['service fee with a fraction of a kobo', { service_fee_kobo: 0.5 }],
      ['negative delivery fee', { delivery_fee_kobo: -1 }],
      [
        'delivery margin above the delivery fee',
        { delivery_fee_kobo: 100, delivery_margin_kobo: 101 },
      ],
    ])('rejects a %s', (_, override) => {
      const error = pricingError({ ...workedExample, ...override });
      expect(error.code).toBe('invalid_input');
      expect(error.cause).toBeDefined();
    });

    it('names the invalid field in the message', () => {
      expect(pricingError({ ...workedExample, quantity: 0 }).message).toContain('quantity');
    });

    it('rejects a total too large to represent safely', () => {
      const error = pricingError({
        ...config,
        quantity: 1_000_000_000,
        duration_days: 36_500,
        unit_price_kobo: 1_000_000_000,
      });
      expect(error.code).toBe('amount_out_of_range');
    });
  });
});
