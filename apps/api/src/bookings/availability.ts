import { sql } from 'kysely';
import type { Database } from '../db/client.js';

/** Free capacity on the busiest day of `[startDate, endDate)`, in the provider's unit (PRD 6.2). */
export async function availableQuantity(
  db: Database,
  providerId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const { rows } = await sql<{
    available_quantity: number;
  }>`select public.provider_available_quantity(${providerId}, ${startDate}::date, ${endDate}::date) as available_quantity`.execute(
    db,
  );
  const [row] = rows;
  if (row === undefined) throw new Error('provider_available_quantity returned no row');
  return row.available_quantity;
}
