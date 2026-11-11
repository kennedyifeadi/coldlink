import { addDays, todayInLagos } from '@coldlink/shared';
import { invalidBody } from './errors.js';

export interface StoragePeriod {
  startDate: string;
  /** The day the produce is collected: the period is `[startDate, endDate)`, as for bookings. */
  endDate: string;
}

/** The period a farmer asked for, starting today in Lagos by default and never earlier. */
export function storagePeriod(
  startDate: string | undefined,
  days: number,
  now: Date,
): StoragePeriod {
  const today = todayInLagos(now);
  const start = startDate ?? today;
  if (start < today) throw invalidBody('start_date', 'Choose today or a later date');
  return { startDate: start, endDate: addDays(start, days) };
}
