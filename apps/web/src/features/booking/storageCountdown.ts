import { todayInLagos } from '@coldlink/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type StorageCountdown =
  { kind: 'daysLeft'; days: number } | { kind: 'today' } | { kind: 'overdue'; days: number };

const daysFrom = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);

/** Days until the end date (the collection day), counted in Lagos calendar days (decision 74). */
export const storageCountdown = (endDate: string, now: Date): StorageCountdown => {
  const days = daysFrom(todayInLagos(now), endDate);
  if (days > 0) return { kind: 'daysLeft', days };
  if (days === 0) return { kind: 'today' };
  return { kind: 'overdue', days: -days };
};
