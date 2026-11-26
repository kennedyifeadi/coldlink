import React, { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Crop } from '@coldlink/shared';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PageHeader from '../../components/ui/PageHeader';
import StepProgress from '../../components/ui/StepProgress';
import TextButton from '../../components/ui/TextButton';
import { inputClasses } from '../../components/ui/inputStyles';
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
  'flex flex-col items-center justify-center gap-2 min-h-24 px-3 py-4 rounded-xl border text-center';

const ProduceSkeleton = () => (
  <div aria-hidden="true" className="grid grid-cols-2 gap-3">
    {Array.from({ length: 8 }, (_, index) => (
      <div key={index} className={`${TILE_CLASSES} border-line`}>
        <div className="w-6 h-6 rounded bg-surface-sunken shrink-0" />
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
    <div className="flex flex-col min-h-screen bg-background">
      <TopNavBar title={t('search.produce.navTitle')} showBack={true} />
      <StepProgress step={2} count={3} label={t('search.step', { step: 2, count: 3 })} />

      <PageHeader title={t('search.produce.title')} />

      <div className="flex flex-col px-5 pt-5 pb-32">
        <div className="relative mb-5">
          <label htmlFor="produce-filter" className="sr-only">
            {t('search.produce.filterLabel')}
          </label>
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-copy-subtle"
            aria-hidden="true"
          />
          <input
            id="produce-filter"
            type="search"
            autoComplete="off"
            placeholder={t('search.produce.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`${inputClasses()} pl-11`}
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
                  className={`relative ${TILE_CLASSES} transition-colors ${
                    isSelected
                      ? 'bg-primary-faint border-primary ring-1 ring-primary'
                      : 'bg-surface border-line hover:border-line-strong hover:bg-surface-muted'
                  }`}
                >
                  <Icon
                    size={24}
                    strokeWidth={1.75}
                    className={isSelected ? 'text-primary-strong' : 'text-copy-muted'}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-body leading-snug text-ink">{crop.name}</span>
                  {isSelected && (
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      className="absolute top-2.5 right-2.5 text-primary-strong"
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
        <PrimaryButton onClick={handleContinue} disabled={!selected}>
          {t('common.continue')}
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Produce;
