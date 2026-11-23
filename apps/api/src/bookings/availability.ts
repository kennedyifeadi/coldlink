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

export interface Occupancy {
  used: number;
  total: number;
}

/**
 * The facility's capacity and how much of it is booked on `date`: the capacity less what
 * availableQuantity's function leaves free that day, subtracted in the database so a decimal
 * quantity stays exact.
 */
export async function occupancyOn(
  db: Database,
  providerId: string,
  date: string,
): Promise<Occupancy> {
  const { rows } = await sql<Occupancy>`
    select capacity_total as total,
      capacity_total - public.provider_available_quantity(id, ${date}::date, ${date}::date + 1) as used
    from public.providers
    where id = ${providerId}`.execute(db);
  const [row] = rows;
  if (row === undefined) throw new Error(`Provider ${providerId} not found`);
  return row;
}
