import { addDays, startOfDayInLagos, todayInLagos } from '@coldlink/shared';
import type { DeliveryTokenPurpose } from '../actions/tokens.js';

const MIN_LIFETIME_MS = 12 * 60 * 60 * 1000;

// Days after the scheduled day whose end the link lasts to: the accept link to the end of the day
// itself, the update link to the end of the next one, for a job that runs late (decision 149).
const DAYS_AFTER: Record<DeliveryTokenPurpose, number> = {
  delivery_accept: 0,
  delivery_update: 1,
};

/**
 * When a partner's link expires: at the end of the delivery's day in Lagos (or of the day after,
 * for the update link), and never sooner than 12 hours after it is issued. `scheduledFor` is the
 * stored 00:00 in Lagos of that day; with none, the link lasts 12 hours.
 */
export function deliveryTokenExpiresAt(
  purpose: DeliveryTokenPurpose,
  scheduledFor: Date | null,
  issuedAt: Date,
): Date {
  const floor = issuedAt.getTime() + MIN_LIFETIME_MS;
  if (scheduledFor === null) return new Date(floor);
  const day = todayInLagos(scheduledFor);
  const end = startOfDayInLagos(addDays(day, DAYS_AFTER[purpose] + 1)).getTime();
  return new Date(Math.max(end, floor));
}
