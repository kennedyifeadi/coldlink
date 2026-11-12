import type { TFunction } from 'i18next';
import type { CapacityUnit } from '@coldlink/shared';
import { formatNumber } from '../../i18n/format';

// The ways farmers count produce first; floor space is how cold rooms, not farmers, measure.
export const UNIT_CHOICES = ['crates', 'kg', 'sqm'] as const satisfies readonly CapacityUnit[];

/** "12 crates", "250 kg" or "40 m²". */
export const formatAmount = (value: number, unit: CapacityUnit, t: TFunction) =>
  t(`search.units.${unit}.amount`, { count: value, value: formatNumber(value) });
