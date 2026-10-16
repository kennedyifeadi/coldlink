import React, { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { produceOptions, type ProduceId, type ProduceOption } from '../data/mockData';
import TopNavBar from '../components/TopNavBar';

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
    <div className="flex flex-col h-full min-h-screen bg-white relative">
      {/* Top App Bar */}
      <TopNavBar title="Produce" showBack={true} />

      <div className="flex flex-col px-6 pt-8 pb-28 flex-grow overflow-y-auto">
        {/* Text Content */}
        <div className="mb-8">
          <h1 className="text-[1.65rem] font-bold text-[#1a3622] mb-3 leading-tight tracking-tight">
            What do you want to store?
          </h1>
          <p className="text-gray-600 text-[1.05rem] leading-relaxed">
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
                    ? 'bg-[#e7eee1] border-[#a8c697] shadow-sm'
                    : 'bg-[#f8f9f7] border-transparent hover:bg-gray-100'
                }`}
              >
                {/* Selected Checkmark */}
                {isSelected && (
                  <div className="absolute top-3 right-3 text-[#68a042]">
                    <CheckCircle2 size={18} />
                  </div>
                )}

                {/* Icon Circle */}
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-white shadow-sm transition-colors ${
                    isSelected ? 'text-[#68a042]' : 'text-[#1a3622]'
                  }`}
                >
                  <IconComponent size={24} strokeWidth={2} />
                </div>

                {/* Name */}
                <span className={`font-medium ${isSelected ? 'text-[#1a3622]' : 'text-gray-800'}`}>
                  {produce.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Area (Sticky) */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-6 bg-gradient-to-t from-white via-white to-transparent z-20 pb-safe">
        <button
          onClick={handleContinue}
          disabled={!selectedProduce}
          className={`group flex items-center justify-center w-full py-4 rounded-lg text-white font-medium text-lg transition-all
            ${!selectedProduce ? 'bg-[#a3c993] cursor-not-allowed opacity-80' : 'bg-[#7ba962] hover:bg-[#689451] shadow-md'}
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
