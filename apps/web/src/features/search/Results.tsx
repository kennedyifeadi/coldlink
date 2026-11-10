import React from 'react';
import { Info, Leaf, MapPin, Scale, SearchX, type LucideIcon } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Crop, SearchBody, SearchResponse } from '@coldlink/shared';
import TopNavBar from '../../components/TopNavBar';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { describeApiError } from '../../api/describeError';
import { searchStorage } from '../../api/search';
import { formatNumber } from '../../i18n/format';
import { useSession, useSessionStore } from '../../session/sessionContext';
import { facilityPath } from '../booking/bookingIntent';
import ResultCard, { ResultCardSkeleton } from './ResultCard';
import { placeLabel } from './placeLabel';
import { readDraft, SEARCH_STEPS, useSearchFlow } from './searchFlow';
import { formatAmount } from './units';

const SKELETON_COUNT = 3;
const RESULTS_STALE_MS = 60_000;

interface SummaryPillProps {
  icon: LucideIcon;
  label: string;
  changeLabel: string;
  onClick: () => void;
}

const SummaryPill = ({ icon: Icon, label, changeLabel, onClick }: SummaryPillProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={changeLabel}
    className="flex items-center gap-1.5 bg-primary-soft text-ink px-3.5 min-h-9 rounded-full font-medium text-label hover:bg-primary-muted transition-colors"
  >
    <Icon size={14} aria-hidden="true" /> {label}
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
    <div className="flex flex-col items-center text-center pt-6">
      <div className="w-20 h-20 mb-6 bg-surface-muted rounded-full flex items-center justify-center text-primary-strong">
        <SearchX size={32} aria-hidden="true" />
      </div>
      <h2 className="font-heading text-headline font-bold text-ink mb-3">
        {t('search.results.emptyTitle', { crop: crop.name.toLowerCase() })}
      </h2>
      <p className="text-copy-muted text-lead leading-relaxed mb-6">
        {t('search.results.emptyBody', { radius: formatNumber(radiusKm) })}
      </p>
      <ul className="text-left text-copy text-body flex flex-col gap-2 mb-8 list-disc pl-5 self-stretch">
        <li>{t('search.results.emptyTips.amount')}</li>
        <li>{t('search.results.emptyTips.unit')}</li>
        <li>{t('search.results.emptyTips.place')}</li>
      </ul>
      <div className="flex flex-col gap-2 self-stretch">
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
      {response.expanded_radius && (
        <div role="status" className="flex gap-3 bg-accent-faint text-accent-ink rounded-xl p-4">
          <Info size={20} className="shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-body leading-relaxed">
            {t('search.results.widened', { radius: formatNumber(response.radius_km) })}
          </p>
        </div>
      )}
      <p className="text-copy-muted text-body">
        {t('search.results.count', { count: response.data.length })}
      </p>
      <ul className="flex flex-col gap-6">
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
    queryKey: ['search', body],
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
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      <TopNavBar title={t('search.results.navTitle')} showBack={true} />

      <div className="flex flex-col gap-6 px-4 pt-6 pb-6 flex-grow">
        <div>
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-4 tracking-tight">
            {t('search.results.title')}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <SummaryPill
              icon={Leaf}
              label={crop.name}
              changeLabel={t('search.results.changeCrop', { value: crop.name })}
              onClick={() => void navigate(SEARCH_STEPS.crop)}
            />
            <SummaryPill
              icon={MapPin}
              label={placeLabel(place, t)}
              changeLabel={t('search.results.changePlace', { value: placeLabel(place, t) })}
              onClick={() => void navigate(SEARCH_STEPS.place)}
            />
            <SummaryPill
              icon={Scale}
              label={amountSummary}
              changeLabel={t('search.results.changeAmountLabel', { value: amountSummary })}
              onClick={() => void navigate(SEARCH_STEPS.amount)}
            />
          </div>
        </div>

        {search.isPending && (
          <>
            <p role="status" className="text-copy-muted text-body">
              {t('search.results.loading')}
            </p>
            <div className="flex flex-col gap-6">
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <ResultCardSkeleton key={index} />
              ))}
            </div>
          </>
        )}

        {search.isError && (
          <div className="flex flex-col gap-4">
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
      </div>

      <BottomNav activeTab="find" />
    </div>
  );
};

export default Results;
