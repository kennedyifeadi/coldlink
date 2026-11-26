import React from 'react';
import { Pencil } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Crop, SearchBody, SearchResponse } from '@coldlink/shared';
import TopNavBar from '../../components/TopNavBar';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import Notice from '../../components/ui/Notice';
import PageHeader from '../../components/ui/PageHeader';
import { describeApiError } from '../../api/describeError';
import { searchQueryKey, searchStorage } from '../../api/search';
import { formatNumber } from '../../i18n/format';
import { useSession, useSessionStore } from '../../session/sessionContext';
import { facilityPath } from '../booking/bookingIntent';
import ResultCard, { ResultCardSkeleton } from './ResultCard';
import { placeLabel } from './placeLabel';
import { readDraft, SEARCH_STEPS, useSearchFlow } from './searchFlow';
import { formatAmount } from './units';

const SKELETON_COUNT = 3;
const RESULTS_STALE_MS = 60_000;

interface SummaryChipProps {
  label: string;
  changeLabel: string;
  onClick: () => void;
}

const SummaryChip = ({ label, changeLabel, onClick }: SummaryChipProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={changeLabel}
    className="inline-flex items-center gap-1.5 border border-line-strong text-ink px-3.5 min-h-10 rounded-full font-medium text-label hover:border-primary hover:bg-primary-faint transition-colors"
  >
    {label}
    <Pencil size={12} className="text-copy-subtle" aria-hidden="true" />
  </button>
);

interface EmptyResultsProps {
  crop: Crop;
  radiusKm: number;
}

const EmptyResults = ({ crop, radiusKm }: EmptyResultsProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col px-5 pt-8">
      <h2 className="text-title font-bold text-ink mb-2">
        {t('search.results.emptyTitle', { crop: crop.name.toLowerCase() })}
      </h2>
      <p className="text-copy-muted text-body mb-5">
        {t('search.results.emptyBody', { radius: formatNumber(radiusKm) })}
      </p>
      <ul className="text-ink text-body flex flex-col gap-2 mb-8 list-disc pl-5 marker:text-primary">
        <li>{t('search.results.emptyTips.amount')}</li>
        <li>{t('search.results.emptyTips.unit')}</li>
        <li>{t('search.results.emptyTips.place')}</li>
      </ul>
      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={() => void navigate(SEARCH_STEPS.place)}>
          {t('search.results.tryAnotherLocation')}
        </PrimaryButton>
        <TextButton onClick={() => void navigate(SEARCH_STEPS.amount)}>
          {t('search.results.changeAmount')}
        </TextButton>
      </div>
    </div>
  );
};

interface ResultListProps {
  response: SearchResponse;
  body: SearchBody;
}

const ResultList = ({ response, body }: ResultListProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col gap-4 px-5 pt-5">
        {response.expanded_radius && (
          <Notice tone="waiting">
            {t('search.results.widened', { radius: formatNumber(response.radius_km) })}
          </Notice>
        )}
        <p className="text-copy-muted text-label font-medium">
          {t('search.results.count', { count: response.data.length })}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {response.data.map((result) => (
          <li key={result.provider.id}>
            <ResultCard
              result={result}
              unit={body.capacity_unit}
              days={body.days}
              onBook={() =>
                void navigate(
                  facilityPath(result.provider.id, {
                    crop_id: body.crop_id,
                    quantity: body.quantity,
                    capacity_unit: body.capacity_unit,
                    days: body.days,
                    start_date: response.start_date,
                  }),
                )
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
};

const Results = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const session = useSession();
  const store = useSessionStore();
  const draft = readDraft(useSearchFlow().draft);
  const body = 'body' in draft ? draft.body : undefined;

  const search = useQuery({
    queryKey: searchQueryKey(body),
    queryFn: ({ signal }) =>
      searchStorage(body!, { store, signedIn: session.status === 'signedIn', signal }),
    // Wait for the session check on load, so a signed-in farmer's search is logged as theirs.
    enabled: body !== undefined && session.status !== 'loading',
    staleTime: RESULTS_STALE_MS,
  });

  if ('missing' in draft) return <Navigate to={SEARCH_STEPS[draft.missing]} replace />;
  const { crop, place } = draft;
  const amount = draft.body;
  const amountSummary = t('search.results.amountSummary', {
    amount: formatAmount(amount.quantity, amount.capacity_unit, t),
    count: amount.days,
  });

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <TopNavBar title={t('search.results.navTitle')} showBack={true} />

      <PageHeader title={t('search.results.title')}>
        <div className="flex flex-wrap items-center gap-2">
          <SummaryChip
            label={crop.name}
            changeLabel={t('search.results.changeCrop', { value: crop.name })}
            onClick={() => void navigate(SEARCH_STEPS.crop)}
          />
          <SummaryChip
            label={placeLabel(place, t)}
            changeLabel={t('search.results.changePlace', { value: placeLabel(place, t) })}
            onClick={() => void navigate(SEARCH_STEPS.place)}
          />
          <SummaryChip
            label={amountSummary}
            changeLabel={t('search.results.changeAmountLabel', { value: amountSummary })}
            onClick={() => void navigate(SEARCH_STEPS.amount)}
          />
        </div>
      </PageHeader>

      {search.isPending && (
        <>
          <p role="status" className="text-copy-muted text-label font-medium px-5 pt-5">
            {t('search.results.loading')}
          </p>
          <div className="divide-y divide-line">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <ResultCardSkeleton key={index} />
            ))}
          </div>
        </>
      )}

      {search.isError && (
        <div className="flex flex-col gap-4 px-5 pt-6">
          <ErrorMessage>{describeApiError(search.error, t)}</ErrorMessage>
          <PrimaryButton onClick={() => void search.refetch()} disabled={search.isFetching}>
            {t('common.tryAgain')}
          </PrimaryButton>
        </div>
      )}

      {search.isSuccess && search.data.data.length === 0 && (
        <EmptyResults crop={crop} radiusKm={search.data.radius_km} />
      )}

      {search.isSuccess && search.data.data.length > 0 && (
        <ResultList response={search.data} body={amount} />
      )}

      <BottomNav activeTab="find" />
    </div>
  );
};

export default Results;
