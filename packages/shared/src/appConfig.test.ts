import { describe, expect, it } from 'vitest';
import { appConfigKeys, appConfigSchema } from './appConfig.js';

// PRD 5.15 placeholders.
const placeholders = {
  commission_rate: 0.075,
  service_fee_kobo: 0,
  deposit_percent: 0.3,
  provider_response_minutes: 120,
  payment_hold_minutes: 15,
  search_default_radius_km: 25,
  search_max_radius_km: 100,
  delivery_base_fee_kobo: 100_000,
  delivery_per_km_kobo: 10_000,
  delivery_min_fee_kobo: 100_000,
  delivery_partner_share: 0.8,
  road_distance_factor: 1.3,
  require_provider_approval: true,
  otp_required: true,
  farmer_free_cancel_hours: 24,
};

function issuePaths(input: unknown): string[] {
  const result = appConfigSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('appConfigSchema', () => {
  it('accepts the PRD 5.15 placeholders', () => {
    expect(appConfigSchema.parse(placeholders)).toEqual(placeholders);
  });

  it('has one key per PRD 5.15 entry', () => {
    expect(appConfigKeys.toSorted()).toEqual(Object.keys(placeholders).toSorted());
  });

  it('reports every missing key', () => {
    expect(issuePaths({}).toSorted()).toEqual(appConfigKeys.toSorted());
  });

  it.each([
    ['deposit_percent equal to commission_rate', { deposit_percent: 0.075 }, 'deposit_percent'],
    ['deposit_percent below commission_rate', { deposit_percent: 0.05 }, 'deposit_percent'],
    [
      'a default radius past the maximum',
      { search_default_radius_km: 101 },
      'search_default_radius_km',
    ],
    ['money in naira', { delivery_base_fee_kobo: 1000.5 }, 'delivery_base_fee_kobo'],
    ['negative money', { service_fee_kobo: -1 }, 'service_fee_kobo'],
    ['a rate past whole basis points', { commission_rate: 0.07501 }, 'commission_rate'],
    ['a rate over 1', { delivery_partner_share: 1.2 }, 'delivery_partner_share'],
    ['a string number', { payment_hold_minutes: '15' }, 'payment_hold_minutes'],
    ['zero minutes', { provider_response_minutes: 0 }, 'provider_response_minutes'],
    ['a fraction of an hour', { farmer_free_cancel_hours: 1.5 }, 'farmer_free_cancel_hours'],
    ['a road factor under 1', { road_distance_factor: 0.9 }, 'road_distance_factor'],
    ['a string boolean', { otp_required: 'true' }, 'otp_required'],
  ])('rejects %s', (_name, override, path) => {
    expect(issuePaths({ ...placeholders, ...override })).toEqual([path]);
  });
});
