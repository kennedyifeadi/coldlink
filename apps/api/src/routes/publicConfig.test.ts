import { appConfigKeys, errorResponseSchema, publicConfigSchema } from '@coldlink/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { stubDatabase, testApp } from '../test/helpers.js';

// PRD 5.15 placeholders, with a service fee set so a value from the database is visible.
const config: Record<string, unknown> = {
  commission_rate: 0.075,
  service_fee_kobo: 50_000,
  deposit_percent: 0.3,
  provider_response_minutes: 120,
  payment_hold_minutes: 30,
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
  paystack_channels: ['card', 'bank', 'ussd', 'bank_transfer'],
  delivery_vehicle_bands: {
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
  },
};

const publicKeys = [
  'search_default_radius_km',
  'search_max_radius_km',
  'service_fee_kobo',
  'deposit_percent',
  'farmer_free_cancel_hours',
];

function app(values: Record<string, unknown> = config) {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value }));
  return testApp(undefined, stubDatabase({ app_config: rows }));
}

describe('GET /api/v1/config/public', () => {
  it('returns the client-safe values from app_config', async () => {
    const response = await request(app().app).get('/api/v1/config/public');
    expect(response.status).toBe(200);
    expect(publicConfigSchema.parse(response.body)).toEqual({
      search_default_radius_km: 25,
      search_max_radius_km: 100,
      service_fee_kobo: 50_000,
      deposit_percent: 0.3,
      farmer_free_cancel_hours: 24,
    });
  });

  it('never returns a private key, including one added to app_config later', async () => {
    const response = await request(app({ ...config, new_internal_key: 'secret' }).app).get(
      '/api/v1/config/public',
    );
    expect(Object.keys(response.body as object).toSorted()).toEqual(publicKeys.toSorted());
    const privateKeys = appConfigKeys.filter((key) => !publicKeys.includes(key));
    expect(privateKeys).toHaveLength(12);
    for (const key of [...privateKeys, 'new_internal_key']) {
      expect(response.body).not.toHaveProperty(key);
    }
  });

  it('is cacheable by clients for 60 seconds', async () => {
    const response = await request(app().app).get('/api/v1/config/public');
    expect(response.headers['cache-control']).toBe('public, max-age=60');
  });

  it('returns a generic 500, without the config values, when app_config is invalid', async () => {
    const { app: broken, logs } = app({ ...config, deposit_percent: 0.05 });
    const response = await request(broken).get('/api/v1/config/public');
    expect(response.status).toBe(500);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('internal');
    expect(JSON.stringify(response.body)).not.toContain('deposit_percent');
    expect(response.headers['cache-control']).toBeUndefined();
    expect(logs.output()).toContain('AppConfigError');
  });
});
