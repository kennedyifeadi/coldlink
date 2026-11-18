import { beforeEach, describe, expect, it } from 'vitest';
import { generateBookingCode } from '../bookings/code.js';
import { insertBooking, insertBookingRow, type BookingFixture } from './bookings.js';
import { noTestDatabase, useTestTransaction } from './integration.js';

describe.skipIf(noTestDatabase)('insertBookingRow', () => {
  const db = useTestTransaction();
  let fixture: BookingFixture;
  let takenCode: string;

  beforeEach(async () => {
    fixture = await insertBooking(db(), 'confirmed');
    ({ code: takenCode } = await db()
      .selectFrom('bookings')
      .select('code')
      .where('id', '=', fixture.bookingId)
      .executeTakeFirstOrThrow());
  });

  async function insertWithCodes(codes: string[]): Promise<string> {
    const { crop_id } = await db()
      .selectFrom('bookings')
      .select('crop_id')
      .where('id', '=', fixture.bookingId)
      .executeTakeFirstOrThrow();
    let next = 0;
    return insertBookingRow(
      db(),
      {
        farmer_id: fixture.farmerId,
        provider_id: fixture.providerId,
        crop_id,
        quantity: 1,
        capacity_unit: 'sqm',
        start_date: '2026-12-01',
        duration_days: 1,
        end_date: '2026-12-02',
        status: 'confirmed',
        unit_price_kobo: 225_800,
        storage_subtotal_kobo: 225_800,
        commission_rate: 0.075,
        commission_kobo: 16_935,
        service_fee_kobo: 0,
        deposit_percent: 0.3,
        deposit_kobo: 67_740,
        balance_due_kobo: 158_060,
        total_charged_online_kobo: 67_740,
      },
      () => codes[Math.min(next++, codes.length - 1)] ?? '',
    );
  }

  it('draws another code when the first is taken', async () => {
    const freshCode = generateBookingCode();
    const id = await insertWithCodes([takenCode, freshCode]);

    const row = await db()
      .selectFrom('bookings')
      .select('code')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.code).toBe(freshCode);
  });

  it('gives up, leaving the transaction usable, when every code is taken', async () => {
    await expect(insertWithCodes([takenCode])).rejects.toThrow('No free booking code');

    const { count } = await db()
      .selectFrom('bookings')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('provider_id', '=', fixture.providerId)
      .executeTakeFirstOrThrow();
    expect(Number(count)).toBe(1);
  });
});
