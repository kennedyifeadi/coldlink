import React from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { koboToNaira, type CapacityUnit, type SearchResult } from '@coldlink/shared';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatNaira, formatNumber } from '../../i18n/format';
import { formatAmount } from './units';

// At or under a tenth of the facility free, the space line warns in words as well as colour.
const LOW_SHARE = 0.1;

interface ResultCardProps {
  result: SearchResult;
  unit: CapacityUnit;
  days: number;
  onBook: () => void;
}

export const Rating = ({ average, count }: { average: number; count: number }) => {
  const { t } = useTranslation();

  if (count === 0) {
    return <span className="text-copy-subtle">{t('search.results.noRatings')}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-ink font-medium">
      <Star size={13} className="fill-accent text-accent" aria-hidden="true" />
      <span aria-hidden="true">{formatNumber(average)}</span>
      <span className="sr-only">
        {t('search.results.rating', { rating: formatNumber(average), count })}
      </span>
    </span>
  );
};

const Dot = () => (
  <span aria-hidden="true" className="text-line-strong">
    ·
  </span>
);

const ResultCard = ({ result, unit, days, onBook }: ResultCardProps) => {
  const { t } = useTranslation();
  const { provider } = result;
  const share = Math.min(result.available_quantity / provider.capacity_total, 1);
  const isLow = share <= LOW_SHARE;
  const free = formatAmount(result.available_quantity, unit, t);

  return (
    <article aria-labelledby={`result-${provider.id}`} className="px-5 py-5">
      <h2 id={`result-${provider.id}`} className="text-subtitle font-bold text-ink">
        {provider.display_name}
      </h2>
      <p className="flex flex-wrap items-center gap-x-2 text-label text-copy-muted mt-0.5">
        <span>{t(`search.facilityTypes.${provider.facility_type}`)}</span>
        <Dot />
        <span>{t('search.results.distance', { distance: formatNumber(result.distance_km) })}</span>
        <Dot />
        <Rating average={provider.avg_rating} count={provider.rating_count} />
      </p>

      <div className="mt-4">
        <p
          className={`text-label font-semibold mb-1.5 ${isLow ? 'text-alert-strong' : 'text-primary-strong'}`}
        >
          {isLow ? t('search.results.lowSpace', { free }) : t('search.results.space', { free })}
        </p>
        <div aria-hidden="true" className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isLow ? 'bg-alert' : 'bg-primary'}`}
            style={{ width: `${Math.max(share * 100, 2)}%` }}
          />
        </div>
      </div>

      <div className="flex items-end justify-between gap-4 mt-4">
        <div className="min-w-0">
          <p className="text-copy-muted text-label">
            {t('search.results.estimate', { count: days })}
          </p>
          <p className="text-ink text-headline font-bold tabular-nums">
            {formatNaira(koboToNaira(result.total_estimate_kobo))}
          </p>
          <p className="text-copy-muted text-label">
            {t('search.results.deposit', {
              amount: formatNaira(koboToNaira(result.deposit_kobo)),
            })}
          </p>
        </div>
        <div className="w-28 shrink-0">
          <PrimaryButton onClick={onBook} compact>
            {t('search.results.book')}
          </PrimaryButton>
        </div>
      </div>
    </article>
  );
};

export const ResultCardSkeleton = () => (
  <div aria-hidden="true" className="px-5 py-5">
    <div className="h-5 w-3/5 rounded bg-surface-sunken" />
    <div className="h-4 w-2/5 rounded bg-surface-muted mt-2" />
    <div className="h-4 w-1/4 rounded bg-surface-muted mt-5" />
    <div className="h-1.5 rounded-full bg-surface-muted mt-2" />
    <div className="flex items-end justify-between mt-5">
      <div className="h-10 w-2/5 rounded bg-surface-muted" />
      <div className="h-12 w-28 rounded-full bg-surface-sunken" />
    </div>
  </div>
);

export default ResultCard;
