import React, { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { produceOptions, type ProduceId, type ProduceOption } from '../../data/mockData';
import TopNavBar from '../../components/TopNavBar';

type ProduceChoice = ProduceId | 'other';

// Append 'Other' for the UI
const optionsToRender: ProduceOption<ProduceChoice>[] = [
  ...produceOptions,
  { id: 'other', name: 'Other', icon: 'Shapes' },
];

const Produce = () => {
  const navigate = useNavigate();
  const [selectedProduce, setSelectedProduce] = useState<ProduceChoice | null>(null);

  const handleContinue = () => {
    if (selectedProduce) {
      void navigate('/discovery');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative">
      {/* Top App Bar */}
      <TopNavBar title="Produce" showBack={true} />

      <div className="flex flex-col px-6 pt-8 pb-28 flex-grow overflow-y-auto">
        {/* Text Content */}
        <div className="mb-8">
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-3 leading-tight tracking-tight">
            What do you want to store?
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">
            Select the produce you're looking to preserve.
          </p>
        </div>

        {/* Produce Grid */}
        <div className="grid grid-cols-2 gap-4">
          {optionsToRender.map((produce) => {
            const isSelected = selectedProduce === produce.id;
            const IconComponent = Icons[produce.icon] || Icons.HelpCircle;

            return (
              <button
                key={produce.id}
                onClick={() => setSelectedProduce(produce.id)}
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

      {/* Bottom Action Area (Sticky) */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-6 pt-6 pb-safe-6 bg-surface border-t border-line z-20">
        <button
          onClick={handleContinue}
          disabled={!selectedProduce}
          className={`group flex items-center justify-center w-full py-4 rounded-lg font-medium text-subtitle transition-all
            ${!selectedProduce ? 'bg-primary-muted text-ink/50 cursor-not-allowed opacity-80' : 'bg-primary hover:bg-primary-hover text-ink shadow-md'}
          `}
        >
          <span>Find cold storage</span>
          <ArrowRight
            size={20}
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
          />
        </button>
      </div>
    </div>
  );
};

export default Produce;
