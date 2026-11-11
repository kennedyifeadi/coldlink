import React, { useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Crop } from '@coldlink/shared';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import StepProgress from '../../components/ui/StepProgress';
import TextButton from '../../components/ui/TextButton';
import { cropsQuery } from '../../api/referenceData';
import { describeApiError } from '../../api/describeError';
import { produceIcon } from './produceIcons';
import { SEARCH_STEPS, useSearchFlow } from './searchFlow';

// Local names are stored without tone marks (decision 40), so plain typing finds "ata" or "isu".
const matches = (crop: Crop, query: string) =>
  [crop.name, ...crop.local_names].some((name) => name.toLowerCase().includes(query));

// Name under the icon, as on the original produce screen: at 360 px a name beside the icon gets
// too little width for words like "Watermelon".
const TILE_CLASSES =
  'flex flex-col items-center justify-center gap-2 min-h-28 px-3 py-4 rounded-2xl border text-center';

const ProduceSkeleton = () => (
  <div aria-hidden="true" className="grid grid-cols-2 gap-3">
    {Array.from({ length: 8 }, (_, index) => (
      <div key={index} className={`${TILE_CLASSES} bg-surface-muted border-transparent`}>
        <div className="w-10 h-10 rounded-full bg-surface-sunken shrink-0" />
        <div className="h-4 w-2/3 rounded bg-surface-sunken" />
      </div>
    ))}
  </div>
);

const Produce = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { draft, update } = useSearchFlow();
  const [selected, setSelected] = useState<Crop | undefined>(draft.crop);
  const [filter, setFilter] = useState('');
  const crops = useQuery(cropsQuery);

  if (!draft.place) return <Navigate to={SEARCH_STEPS.place} replace />;

  const handleContinue = () => {
    if (!selected) return;
    update({ crop: selected });
    void navigate(SEARCH_STEPS.amount);
  };

  const query = filter.trim().toLowerCase();
  const shown = crops.data?.data.filter((crop) => matches(crop, query)) ?? [];

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative">
      <TopNavBar title={t('search.produce.navTitle')} showBack={true} />
      <StepProgress step={2} count={3} label={t('search.step', { step: 2, count: 3 })} />

      <div className="flex flex-col px-6 pt-8 pb-28 flex-grow overflow-y-auto">
        <div className="mb-6">
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-3 leading-tight tracking-tight">
            {t('search.produce.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">{t('search.produce.intro')}</p>
        </div>

        <div className="relative mb-6">
          <label htmlFor="produce-filter" className="sr-only">
            {t('search.produce.filterLabel')}
          </label>
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-copy-subtle">
            <Search size={18} />
          </div>
          <input
            id="produce-filter"
            type="search"
            autoComplete="off"
            placeholder={t('search.produce.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-surface border border-line-strong rounded-xl text-body placeholder-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all"
          />
        </div>

        {crops.isPending && (
          <>
            <p role="status" className="sr-only">
              {t('search.produce.loading')}
            </p>
            <ProduceSkeleton />
          </>
        )}

        {crops.isError && (
          <div className="flex flex-col gap-3">
            <ErrorMessage>{describeApiError(crops.error, t)}</ErrorMessage>
            <TextButton onClick={() => void crops.refetch()} disabled={crops.isFetching}>
              {t('common.tryAgain')}
            </TextButton>
          </div>
        )}

        {crops.isSuccess && shown.length === 0 && (
          <p className="text-copy-muted text-body">
            {t('search.produce.noMatch', { query: filter.trim() })}
          </p>
        )}

        {crops.isSuccess && shown.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {shown.map((crop) => {
              const isSelected = selected?.id === crop.id;
              const Icon = produceIcon(crop.category_slug);

              return (
                <button
                  key={crop.id}
                  type="button"
                  onClick={() => setSelected(crop)}
                  aria-pressed={isSelected}
                  className={`relative ${TILE_CLASSES} transition-all ${
                    isSelected
                      ? 'bg-primary-soft border-primary shadow-sm'
                      : 'bg-surface-muted border-transparent hover:bg-surface-sunken'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center bg-surface shadow-sm shrink-0 ${
                      isSelected ? 'text-primary-strong' : 'text-ink'
                    }`}
                  >
                    <Icon size={20} strokeWidth={2} />
                  </div>
                  <span
                    className={`font-medium text-body leading-snug ${isSelected ? 'text-ink' : 'text-copy'}`}
                  >
                    {crop.name}
                  </span>
                  {isSelected && (
                    <CheckCircle2
                      size={16}
                      className="absolute top-2 right-2 text-primary-strong"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={handleContinue} disabled={!selected} withArrow>
          {t('common.continue')}
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Produce;
