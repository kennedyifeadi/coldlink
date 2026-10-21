import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { produceOptions, type ProduceOption } from '../../data/mockData';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { produceIcons, type ProduceChoice } from './produceIcons';

// Append 'Other' for the UI
const optionsToRender: ProduceOption<ProduceChoice>[] = [
  ...produceOptions,
  { id: 'other', name: 'Other' },
];

const Produce = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selectedProduce, setSelectedProduce] = useState<ProduceChoice | null>(null);

  const handleContinue = () => {
    if (selectedProduce) {
      void navigate('/discovery');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative">
      {/* Top App Bar */}
      <TopNavBar title={t('search.produce.navTitle')} showBack={true} />

      <div className="flex flex-col px-6 pt-8 pb-28 flex-grow overflow-y-auto">
        {/* Text Content */}
        <div className="mb-8">
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-3 leading-tight tracking-tight">
            {t('search.produce.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">{t('search.produce.intro')}</p>
        </div>

        {/* Produce Grid */}
        <div className="grid grid-cols-2 gap-4">
          {optionsToRender.map((produce) => {
            const isSelected = selectedProduce === produce.id;
            const IconComponent = produceIcons[produce.id];

            return (
              <button
                key={produce.id}
                onClick={() => setSelectedProduce(produce.id)}
                aria-pressed={isSelected}
                className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-primary-soft border-primary shadow-sm'
                    : 'bg-surface-muted border-transparent hover:bg-surface-sunken'
                }`}
              >
                {/* Selected Checkmark */}
                {isSelected && (
                  <div className="absolute top-3 right-3 text-primary-strong">
                    <CheckCircle2 size={18} />
                  </div>
                )}

                {/* Icon Circle */}
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-surface shadow-sm transition-colors ${
                    isSelected ? 'text-primary-strong' : 'text-ink'
                  }`}
                >
                  <IconComponent size={24} strokeWidth={2} />
                </div>

                {/* Name */}
                <span className={`font-medium ${isSelected ? 'text-ink' : 'text-copy'}`}>
                  {produce.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={handleContinue} disabled={!selectedProduce} withArrow>
          {t('search.produce.findStorage')}
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Produce;
