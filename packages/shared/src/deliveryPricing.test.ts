import { describe, expect, it } from 'vitest';
import {
  acceptsDelivery,
  calculateDeliveryFee,
  deliveryWindow,
  haversineKm,
  isInWindow,
  roadDistanceKm,
  vehicleBandsSchema,
  vehicleForLoad,
  type DeliveryRates,
  type VehicleBands,
} from './deliveryPricing.js';
import { bookingStatuses } from './enums.js';

// The PRD 5.15 placeholders.
const rates: DeliveryRates = {
  delivery_base_fee_kobo: 100_000,
  delivery_per_km_kobo: 10_000,
  delivery_min_fee_kobo: 100_000,
  delivery_partner_share: 0.8,
};

const bands: VehicleBands = {
  crates: [
    { vehicle_type: 'bike', below: 6 },
    { vehicle_type: 'van', below: null },
  ],
  kg: [
    { vehicle_type: 'bike', below: 150 },
    { vehicle_type: 'van', below: null },
  ],
  sqm: [
    { vehicle_type: 'bike', below: 1 },
    { vehicle_type: 'van', below: null },
  ],
};

describe('haversineKm', () => {
  it('is 0 between a point and itself', () => {
    expect(haversineKm({ lat: 7.4, lng: 3.9 }, { lat: 7.4, lng: 3.9 })).toBe(0);
  });

  it('gives a degree of latitude as 111.195 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.1951, 4);
  });

  it('shrinks a degree of longitude with the cosine of the latitude', () => {
    const atEquator = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const at60 = haversineKm({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    expect(at60 / atEquator).toBeCloseTo(0.5, 3);
  });

  it('is the same in both directions', () => {
    const bodija = { lat: 7.4352, lng: 3.9133 };
    const dugbe = { lat: 7.3878, lng: 3.8838 };
    expect(haversineKm(bodija, dugbe)).toBe(haversineKm(dugbe, bodija));
    expect(haversineKm(bodija, dugbe)).toBeCloseTo(6.19, 2);
  });
});

describe('roadDistanceKm', () => {
  it('multiplies by the road factor and rounds to 0.1 km', () => {
    // 11.11951 km × 1.3 = 14.4554 km.
    expect(roadDistanceKm({ lat: 0, lng: 0 }, { lat: 0.1, lng: 0 }, 1.3)).toBe(14.5);
  });

  it('rounds to the nearest 0.1 km', () => {
    // 1.111951 km × 1.35 = 1.50113 km, and × 1.304 = 1.44998 km.
    expect(roadDistanceKm({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 }, 1.35)).toBe(1.5);
    expect(roadDistanceKm({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 }, 1.304)).toBe(1.4);
  });
});

describe('calculateDeliveryFee', () => {
  it('prices 12.3 km at the placeholders: ₦1,000 + 12.3 × ₦100 = ₦2,230', () => {
    expect(calculateDeliveryFee(12.3, rates)).toEqual({
      fee_kobo: 223_000,
      partner_payout_kobo: 178_400,
      platform_margin_kobo: 44_600,
    });
  });

  it('charges the minimum when the formula comes to less', () => {
    const cheap = { ...rates, delivery_base_fee_kobo: 50_000 };
    // ₦500 + 2 × ₦100 = ₦700, under the ₦1,000 minimum.
    expect(calculateDeliveryFee(2, cheap).fee_kobo).toBe(100_000);
    expect(calculateDeliveryFee(0, cheap).fee_kobo).toBe(100_000);
  });

  it('charges the formula from exactly the minimum upwards', () => {
    const cheap = { ...rates, delivery_base_fee_kobo: 50_000 };
    expect(calculateDeliveryFee(5, cheap).fee_kobo).toBe(100_000);
    expect(calculateDeliveryFee(5.1, cheap).fee_kobo).toBe(101_000);
  });

  it('rounds the per-km part half up to whole kobo', () => {
    // 12.3 × 10,001 = 123,012.3 kobo, and 0.1 × 10,005 = 1,000.5 kobo.
    expect(calculateDeliveryFee(12.3, { ...rates, delivery_per_km_kobo: 10_001 }).fee_kobo).toBe(
      223_012,
    );
    const small = {
      delivery_base_fee_kobo: 0,
      delivery_per_km_kobo: 10_005,
      delivery_min_fee_kobo: 1,
      delivery_partner_share: 0.5,
    };
    // 0.5 × 1,001 = 500.5 kobo, so the partner gets 501 and ColdLink the other 500.
    expect(calculateDeliveryFee(0.1, small)).toEqual({
      fee_kobo: 1001,
      partner_payout_kobo: 501,
      platform_margin_kobo: 500,
    });
  });

  it('rounds the payout half up and splits the fee exactly', () => {
    // 0.8 × 223,012 = 178,409.6 kobo.
    expect(calculateDeliveryFee(12.3, { ...rates, delivery_per_km_kobo: 10_001 })).toEqual({
      fee_kobo: 223_012,
      partner_payout_kobo: 178_410,
      platform_margin_kobo: 44_602,
    });
    for (const km of [0, 0.1, 3.7, 19.9, 87.4]) {
      for (const share of [0, 0.3333, 0.8, 1]) {
        const fee = calculateDeliveryFee(km, { ...rates, delivery_partner_share: share });
        expect(fee.partner_payout_kobo + fee.platform_margin_kobo).toBe(fee.fee_kobo);
        expect(fee.platform_margin_kobo).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('vehicleForLoad', () => {
  it('sends a bike below the threshold and a van at or above it', () => {
    expect(vehicleForLoad(bands, 5, 'crates')).toBe('bike');
    expect(vehicleForLoad(bands, 6, 'crates')).toBe('van');
    expect(vehicleForLoad(bands, 149.999, 'kg')).toBe('bike');
    expect(vehicleForLoad(bands, 150, 'kg')).toBe('van');
    expect(vehicleForLoad(bands, 0.5, 'sqm')).toBe('bike');
    expect(vehicleForLoad(bands, 1, 'sqm')).toBe('van');
  });

  it('uses a tricycle and a truck when they are configured', () => {
    const four: VehicleBands = {
      ...bands,
      crates: [
        { vehicle_type: 'bike', below: 6 },
        { vehicle_type: 'tricycle', below: 15 },
        { vehicle_type: 'van', below: 60 },
        { vehicle_type: 'truck', below: null },
      ],
    };
    expect(vehicleForLoad(four, 14, 'crates')).toBe('tricycle');
    expect(vehicleForLoad(four, 15, 'crates')).toBe('van');
    expect(vehicleForLoad(four, 60, 'crates')).toBe('truck');
  });
});

describe('vehicleBandsSchema', () => {
  const issues = (value: unknown) => {
    const result = vehicleBandsSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };

  it('accepts bands with one open band last', () => {
    expect(issues(bands)).toEqual([]);
    expect(issues({ ...bands, kg: [{ vehicle_type: 'van', below: null }] })).toEqual([]);
  });

  it('refuses a unit with no bands, or one missing', () => {
    expect(issues({ ...bands, kg: [] })).toEqual(['kg']);
    expect(issues({ crates: bands.crates, kg: bands.kg })).toEqual(['sqm']);
  });

  it('refuses a closed last band and an open band before the last', () => {
    expect(issues({ ...bands, crates: [{ vehicle_type: 'bike', below: 6 }] })).toEqual([
      'crates.0.below',
    ]);
    expect(
      issues({
        ...bands,
        crates: [
          { vehicle_type: 'bike', below: null },
          { vehicle_type: 'van', below: null },
        ],
      }),
    ).toEqual(['crates.0.below']);
  });

  it('refuses thresholds that do not rise, and a vehicle listed twice', () => {
    expect(
      issues({
        ...bands,
        crates: [
          { vehicle_type: 'bike', below: 6 },
          { vehicle_type: 'tricycle', below: 6 },
          { vehicle_type: 'van', below: null },
        ],
      }),
    ).toEqual(['crates.1.below']);
    expect(
      issues({
        ...bands,
        crates: [
          { vehicle_type: 'bike', below: 6 },
          { vehicle_type: 'bike', below: null },
        ],
      }),
    ).toEqual(['crates']);
  });

  it('refuses an unknown vehicle and a threshold of 0', () => {
    expect(issues({ ...bands, crates: [{ vehicle_type: 'boat', below: null }] })).toEqual([
      'crates.0.vehicle_type',
    ]);
    expect(
      issues({
        ...bands,
        crates: [
          { vehicle_type: 'bike', below: 0 },
          { vehicle_type: 'van', below: null },
        ],
      }),
    ).toEqual(['crates.0.below']);
  });
});

describe('deliveryWindow', () => {
  const booking = { start_date: '2026-12-01', end_date: '2026-12-31' };
  const at = (iso: string) => new Date(iso);

  it('runs inbound from today to the start date', () => {
    expect(deliveryWindow('inbound', booking, at('2026-11-26T10:00:00Z'))).toEqual({
      earliest_date: '2026-11-26',
      latest_date: '2026-12-01',
    });
  });

  it('runs outbound from the start date, or today once it has passed, to the end date', () => {
    expect(deliveryWindow('outbound', booking, at('2026-11-26T10:00:00Z'))).toEqual({
      earliest_date: '2026-12-01',
      latest_date: '2026-12-31',
    });
    expect(deliveryWindow('outbound', booking, at('2026-12-10T10:00:00Z'))).toEqual({
      earliest_date: '2026-12-10',
      latest_date: '2026-12-31',
    });
  });

  it('counts days on the Lagos calendar', () => {
    // 00:30 in Lagos on 1 December, still 30 November in UTC.
    expect(deliveryWindow('inbound', booking, at('2026-11-30T23:30:00Z'))).toEqual({
      earliest_date: '2026-12-01',
      latest_date: '2026-12-01',
    });
    // 23:59 in Lagos on 1 December, then 00:00 on 2 December.
    expect(deliveryWindow('inbound', booking, at('2026-12-01T22:59:59Z'))).toEqual({
      earliest_date: '2026-12-01',
      latest_date: '2026-12-01',
    });
    expect(deliveryWindow('inbound', booking, at('2026-12-01T23:00:00Z'))).toBeUndefined();
  });

  it('closes outbound once the end date has passed in Lagos', () => {
    expect(deliveryWindow('outbound', booking, at('2026-12-31T22:59:59Z'))).toEqual({
      earliest_date: '2026-12-31',
      latest_date: '2026-12-31',
    });
    expect(deliveryWindow('outbound', booking, at('2026-12-31T23:00:00Z'))).toBeUndefined();
  });
});

describe('isInWindow', () => {
  const window = { earliest_date: '2026-11-26', latest_date: '2026-12-01' };

  it('includes both ends and nothing outside them', () => {
    expect(isInWindow(window, '2026-11-26')).toBe(true);
    expect(isInWindow(window, '2026-12-01')).toBe(true);
    expect(isInWindow(window, '2026-11-25')).toBe(false);
    expect(isInWindow(window, '2026-12-02')).toBe(false);
  });
});

describe('acceptsDelivery', () => {
  it('takes an inbound delivery only while confirmed', () => {
    expect(bookingStatuses.filter((status) => acceptsDelivery('inbound', status))).toEqual([
      'confirmed',
    ]);
  });

  it('takes an outbound delivery while confirmed or in storage', () => {
    expect(bookingStatuses.filter((status) => acceptsDelivery('outbound', status))).toEqual([
      'confirmed',
      'in_storage',
    ]);
  });
});
