import React from 'react';
import { MapPin, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { koboToNaira, type CapacityUnit, type SearchResult } from '@coldlink/shared';
import Card from '../../components/ui/Card';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatNaira, formatNumber } from '../../i18n/format';
import { facilityTypeIcons } from './facilityTypeIcons';
import { formatAmount } from './units';

// At or under a tenth of the facility free, the space line warns in words as well as colour.
const LOW_SHARE = 0.1;

interface ResultCardProps {
  result: SearchResult;
  unit: CapacityUnit;
  days: number;
  onBook: () => void;
}

const Rating = ({ average, count }: { average: number; count: number }) => {
  const { t } = useTranslation();

  if (count === 0) {
    return (
      <span className="bg-surface-muted text-copy-muted px-2 py-0.5 rounded text-label font-medium shrink-0">
        {t('search.results.noRatings')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 bg-primary-soft text-ink px-2 py-0.5 rounded text-label font-medium shrink-0">
      <Star size={12} className="fill-current" aria-hidden="true" />
      <span aria-hidden="true">{formatNumber(average)}</span>
      <span className="sr-only">
        {t('search.results.rating', { rating: formatNumber(average), count })}
      </span>
    </span>
  );
};

const ResultCard = ({ result, unit, days, onBook }: ResultCardProps) => {
  const { t } = useTranslation();
  const { provider } = result;
  const TypeIcon = facilityTypeIcons[provider.facility_type];
  const share = Math.min(result.available_quantity / provider.capacity_total, 1);
  const isLow = share <= LOW_SHARE;
  const free = formatAmount(result.available_quantity, unit, t);

  return (
    <Card className="p-4">
      <article aria-labelledby={`result-${provider.id}`}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary-soft text-primary-strong flex items-center justify-center shrink-0">
            <TypeIcon size={22} aria-hidden="true" />
          </div>
          <div className="flex-grow min-w-0">
            <h2
              id={`result-${provider.id}`}
              className="font-heading text-title font-bold text-ink leading-tight"
            >
              {provider.display_name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="text-copy-muted text-label">
                {t(`search.facilityTypes.${provider.facility_type}`)}
              </span>
              <Rating average={provider.avg_rating} count={provider.rating_count} />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center gap-3 text-body mb-2">
          <span className="flex items-center text-copy-muted">
            <MapPin size={14} className="mr-1 opacity-70" aria-hidden="true" />
            {t('search.results.distance', { distance: formatNumber(result.distance_km) })}
          </span>
          <span className={`font-medium ${isLow ? 'text-alert-strong' : 'text-ink'}`}>
            {isLow ? t('search.results.lowSpace', { free }) : t('search.results.space', { free })}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="w-full h-1.5 bg-primary-soft rounded-full overflow-hidden flex mb-4"
        >
          <div
            className={`h-full rounded-full ${isLow ? 'bg-alert' : 'bg-primary'}`}
            style={{ width: `${share * 100}%` }}
          ></div>
        </div>

        <div className="flex justify-between items-end gap-3 mb-4">
          <div>
            <p className="text-copy-muted text-label">
              {t('search.results.estimate', { count: days })}
            </p>
            <p className="text-ink text-headline font-bold">
              {formatNaira(koboToNaira(result.total_estimate_kobo))}
            </p>
          </div>
          <p className="text-copy-muted text-label text-right">
            {t('search.results.deposit', {
              amount: formatNaira(koboToNaira(result.deposit_kobo)),
            })}
          </p>
        </div>

        <PrimaryButton onClick={onBook} compact>
          {t('search.results.book')}
        </PrimaryButton>
      </article>
    </Card>
  );
};

export const ResultCardSkeleton = () => (
  <Card className="p-4">
    <div aria-hidden="true">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-surface-sunken shrink-0" />
        <div className="flex-grow flex flex-col gap-2 pt-1">
          <div className="h-5 w-3/4 rounded bg-surface-sunken" />
          <div className="h-4 w-1/3 rounded bg-surface-muted" />
        </div>
      </div>
      <div className="h-6 mb-2 rounded bg-surface-muted" />
      <div className="h-1.5 mb-4 rounded-full bg-surface-muted" />
      <div className="h-14 mb-4 w-1/2 rounded bg-surface-muted" />
      <div className="h-[52px] rounded-lg bg-surface-sunken" />
    </div>
  </Card>
);

export default ResultCard;
