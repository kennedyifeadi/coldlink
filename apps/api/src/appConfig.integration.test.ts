import type { AppConfig } from '@coldlink/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppConfigError, createAppConfigReader } from './appConfig.js';
import { noTestDatabase, useTestTransaction } from './test/integration.js';

// PRD 5.15 placeholders, inserted by each test rather than taken from a seed.
const placeholders: AppConfig = {
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

async function readError(read: Promise<unknown>): Promise<AppConfigError> {
  try {
    await read;
  } catch (error) {
    if (error instanceof AppConfigError) return error;
    throw error;
  }
  throw new Error('Expected the read to fail');
}

describe.skipIf(noTestDatabase)('app_config reader', () => {
  const db = useTestTransaction();
  let time = 0;
  const now = () => time;

  async function setValue(key: string, value: unknown): Promise<void> {
    await db()
      .updateTable('app_config')
      .set({ value: JSON.stringify(value) })
      .where('key', '=', key)
      .execute();
  }

  beforeEach(async () => {
    time = 0;
    await db().deleteFrom('app_config').execute();
    await db()
      .insertInto('app_config')
      .values(
        Object.entries(placeholders).map(([key, value]) => ({ key, value: JSON.stringify(value) })),
      )
      .execute();
  });

  it('reads every key as a typed value', async () => {
    await expect(createAppConfigReader(db(), { now }).get()).resolves.toEqual(placeholders);
  });

  it('serves the cached config for 60 seconds, then reads the database again', async () => {
    const reader = createAppConfigReader(db(), { now });
    await reader.get();
    await setValue('commission_rate', 0.05);

    time = 59_999;
    expect((await reader.get()).commission_rate).toBe(0.075);
    time = 60_000;
    expect((await reader.get()).commission_rate).toBe(0.05);
  });

  it('reads the database again after the cache is cleared', async () => {
    const reader = createAppConfigReader(db(), { now });
    await reader.get();
    await setValue('payment_hold_minutes', 20);
    expect((await reader.get()).payment_hold_minutes).toBe(15);

    reader.clear();
    expect((await reader.get()).payment_hold_minutes).toBe(20);
  });

  it('raises on a malformed value instead of falling back to a default', async () => {
    await setValue('commission_rate', '0.075');
    await setValue('delivery_base_fee_kobo', 1000.5);
    const error = await readError(createAppConfigReader(db(), { now }).get());
    expect(error.issues).toEqual([
      expect.stringMatching(/^commission_rate: /),
      expect.stringMatching(/^delivery_base_fee_kobo: /),
    ]);
  });

  it('raises on a missing key', async () => {
    await db()
      .deleteFrom('app_config')
      .where('key', 'in', ['otp_required', 'service_fee_kobo'])
      .execute();
    const error = await readError(createAppConfigReader(db(), { now }).get());
    expect(error.issues).toEqual(['service_fee_kobo: Missing', 'otp_required: Missing']);
  });

  it('raises when deposit_percent is not greater than commission_rate', async () => {
    await setValue('deposit_percent', 0.075);
    const error = await readError(createAppConfigReader(db(), { now }).get());
    expect(error.issues).toEqual([
      'deposit_percent: deposit_percent must be greater than commission_rate',
    ]);
  });

  it('does not cache a failed read', async () => {
    const reader = createAppConfigReader(db(), { now });
    await setValue('otp_required', 'yes');
    await expect(reader.get()).rejects.toThrow(AppConfigError);

    await setValue('otp_required', false);
    expect((await reader.get()).otp_required).toBe(false);
  });
});
