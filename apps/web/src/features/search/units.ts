import type { TFunction } from 'i18next';
import type { CapacityUnit } from '@coldlink/shared';
import { formatNumber } from '../../i18n/format';

/** "12 crates", "250 kg" or "40 m²". */
export const formatAmount = (value: number, unit: CapacityUnit, t: TFunction) =>
  t(`search.units.${unit}.amount`, { count: value, value: formatNumber(value) });
