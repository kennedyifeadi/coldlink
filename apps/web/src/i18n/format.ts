import { koboToNaira } from '@coldlink/shared';

// Fixed to en-NG so separators never depend on the browser's locale.
const LOCALE = 'en-NG';

const nairaFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});

// For amounts with kobo, so a price is never rounded on the way to the screen.
const nairaWithKoboFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat(LOCALE);

// Booking dates are calendar days in Lagos (decision 74); read at UTC midnight, the day never shifts.
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatNaira = (amount: number) => nairaFormat.format(amount);

/** "₦35,000", or "₦12,345.67" when there are kobo. */
export const formatKobo = (kobo: number) => {
  const naira = koboToNaira(kobo);
  return (Number.isInteger(naira) ? nairaFormat : nairaWithKoboFormat).format(naira);
};

/** An ISO calendar date ("2026-11-10") as "Tue, 10 Nov 2026". */
export const formatDate = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

export const formatNumber = (value: number) => numberFormat.format(value);
