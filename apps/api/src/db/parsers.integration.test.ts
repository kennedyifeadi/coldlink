import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';

describe.skipIf(noTestDatabase)('type mapping against Postgres', () => {
  const db = useTestTransaction();

  it('reads bigint as a number up to the largest safe integer', async () => {
    const { rows } = await sql<{ kobo: number; max_safe: number; total: number }>`
      select 13548000::bigint as kobo, 9007199254740991::bigint as max_safe, count(*) as total
      from (values (1), (2)) as v (n)
    `.execute(db());
    expect(rows).toEqual([{ kobo: 13_548_000, max_safe: Number.MAX_SAFE_INTEGER, total: 2 }]);
  });

  it.each(['9007199254740992', '-9007199254740992', '9223372036854775807'])(
    'refuses bigint %s, past the safe range',
    async (value) => {
      await expect(sql`select ${sql.raw(value)}::bigint as kobo`.execute(db())).rejects.toThrow(
        new RangeError(`bigint ${value} is outside the safe integer range and cannot be read`),
      );
    },
  );

  it('reads numeric quantities and rates as exact numbers', async () => {
    const { rows } = await sql<{ quantity: number; rate: number; capacity: number }>`
      select 1234.567::numeric as quantity, 0.0750::numeric(5, 4) as rate,
        12.50::numeric as capacity
    `.execute(db());
    expect(rows).toEqual([{ quantity: 1234.567, rate: 0.075, capacity: 12.5 }]);
  });

  it('refuses a numeric that a number cannot hold exactly', async () => {
    await expect(
      sql`select 0.12345678901234567890::numeric as quantity`.execute(db()),
    ).rejects.toThrow(RangeError);
  });

  it('keeps a date as the same calendar day whatever the session time zone', async () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Africa/Lagos']) {
      await sql`select set_config('TimeZone', ${zone}, true)`.execute(db());
      const { rows } = await sql<{ start_date: string }>`
        select '2026-11-04'::date as start_date
      `.execute(db());
      expect(rows).toEqual([{ start_date: '2026-11-04' }]);
    }
  });

  it('round-trips money, quantities, rates and dates through table columns', async () => {
    await sql`
      create temporary table mapping_check (
        amount_kobo bigint, quantity numeric, rate numeric, start_date date
      ) on commit drop
    `.execute(db());
    await sql`
      insert into mapping_check values (${13_548_000}, ${2.125}, ${0.3}, ${'2026-11-04'})
    `.execute(db());
    const { rows } = await sql`select * from mapping_check`.execute(db());
    expect(rows).toEqual([
      { amount_kobo: 13_548_000, quantity: 2.125, rate: 0.3, start_date: '2026-11-04' },
    ]);
  });

  it('reads numeric columns of a migrated table through the typed query builder', async () => {
    const category = await db()
      .insertInto('crop_categories')
      .values({ slug: 'mapping_check', name: 'Mapping check' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const crop = await db()
      .insertInto('crops')
      .values({
        category_id: category.id,
        name: 'Mapping check',
        recommended_temp_min_c: 7.5,
        recommended_temp_max_c: 13,
      })
      .returning(['recommended_temp_min_c', 'recommended_temp_max_c', 'created_at'])
      .executeTakeFirstOrThrow();
    expect(crop.recommended_temp_min_c).toBe(7.5);
    expect(crop.recommended_temp_max_c).toBe(13);
    expect(crop.created_at).toBeInstanceOf(Date);
  });
});
