// Calendar dates are 'YYYY-MM-DD' strings (decision 43). ColdLink's users are in Oyo State, so
// "today" is the date in Africa/Lagos, which a UTC date gets wrong between 00:00 and 01:00 WAT.
const lagosDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInLagos(now: Date = new Date()): string {
  return lagosDate.format(now);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The calendar date `days` after a 'YYYY-MM-DD' date, as a booking's end date is (PRD 5.5). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
