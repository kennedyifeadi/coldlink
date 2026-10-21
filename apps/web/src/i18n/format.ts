// Fixed to en-NG so separators never depend on the browser's locale.
const LOCALE = 'en-NG';

const nairaFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});

const numberFormat = new Intl.NumberFormat(LOCALE);

export const formatNaira = (amount: number) => nairaFormat.format(amount);

export const formatNumber = (value: number) => numberFormat.format(value);
