import { describe, expect, it } from 'vitest';
import { MAX_SEARCH_DAYS, searchBodySchema } from './search.js';

const valid = {
  lat: 7.3775,
  lng: 3.947,
  crop_id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  quantity: 20,
  capacity_unit: 'crates',
  days: 14,
};

function issuePaths(body: unknown): string[] {
  const result = searchBodySchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('searchBodySchema', () => {
  it('leaves the start date to the server when none is sent', () => {
    expect(searchBodySchema.parse(valid)).toEqual(valid);
  });

  it('accepts a calendar start date', () => {
    expect(searchBodySchema.parse({ ...valid, start_date: '2026-12-01' }).start_date).toBe(
      '2026-12-01',
    );
  });

  it.each([
    ['a timestamp', '2026-12-01T00:00:00Z'],
    ['an impossible date', '2026-02-30'],
  ])('rejects %s as the start date', (_case, start_date) => {
    expect(issuePaths({ ...valid, start_date })).toEqual(['start_date']);
  });

  it.each([
    ['quantity', 0],
    ['quantity', 1.0005],
    ['days', 0],
    ['days', 1.5],
    ['days', MAX_SEARCH_DAYS + 1],
    ['lat', 91],
    ['lng', -181],
  ])('rejects %s of %s', (field, value) => {
    expect(issuePaths({ ...valid, [field]: value })).toEqual([field]);
  });

  it('accepts the longest period', () => {
    expect(searchBodySchema.safeParse({ ...valid, days: MAX_SEARCH_DAYS }).success).toBe(true);
  });

  it('needs a capacity unit, since quantities are in the provider unit', () => {
    const { capacity_unit: _unit, ...withoutUnit } = valid;
    expect(issuePaths(withoutUnit)).toEqual(['capacity_unit']);
    expect(issuePaths({ ...valid, capacity_unit: 'bags' })).toEqual(['capacity_unit']);
  });

  it('rejects unknown fields', () => {
    expect(searchBodySchema.safeParse({ ...valid, radius_km: 500 }).success).toBe(false);
  });
});
