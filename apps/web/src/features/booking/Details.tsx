import React, { useState } from 'react';
import { MapPin, Star, Minus, Plus, Warehouse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sampleColdRoom as room } from '../../data/mockData';
import TopNavBar from '../../components/TopNavBar';
import PrimaryButton from '../../components/ui/PrimaryButton';

const Details = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState(2);
  const maxUnits = 10;
  const pricePerUnit = 1500;
  const availablePercentage = (room.availableCapacity / room.totalCapacity) * 100;

  const handleDecrease = () => {
    if (units > 1) setUnits(units - 1);
  };

  const handleIncrease = () => {
    if (units < maxUnits) setUnits(units + 1);
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      {/* Top App Bar */}
      <TopNavBar title="Details" showBack={true} />

      <div className="flex flex-col px-4 pt-4 flex-grow overflow-y-auto">
        {/* Hero Card */}
        <div className="relative w-full h-64 rounded-2xl overflow-hidden mb-6 shadow-sm bg-primary-soft">
          <div className="absolute inset-0 flex items-center justify-center pb-16 text-primary-strong">
            <Warehouse size={56} strokeWidth={1.5} />
          </div>

          {/* Hero Content */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
            <div>
              <h1 className="font-heading text-headline font-bold mb-1 leading-tight text-ink">
                {room.name}
              </h1>
              <div className="flex items-center text-copy-muted text-label">
                <MapPin size={14} className="mr-1" /> {room.location}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-surface text-ink px-2.5 py-1 rounded-md text-label font-bold shadow-md shrink-0">
              <Star size={14} className="fill-accent text-accent" /> {room.rating}
            </div>
          </div>
        </div>

        {/* Storage Capacity Section */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-card mb-8">
          <div className="flex justify-between items-end mb-2">
            <span className="font-heading font-semibold text-ink text-subtitle">
              Storage Capacity
            </span>
            <span className="text-copy-muted text-body">
              {room.availableCapacity} of {room.totalCapacity} units available
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-line-strong rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${availablePercentage}%` }}
            ></div>
          </div>
        </div>

        {/* How much storage Section */}
        <div className="mb-6">
          <h2 className="font-heading text-title font-bold text-ink mb-1">How much storage?</h2>
          <div className="flex justify-between items-center mb-4">
            <span className="text-copy-muted text-lead">
              ₦{pricePerUnit.toLocaleString()} / unit / day
            </span>
            <span className="text-copy text-label font-medium">Max {maxUnits} units</span>
          </div>

          {/* Counter Control */}
          <div className="flex items-center justify-between bg-surface border border-line rounded-2xl p-3 shadow-card">
            <button
              onClick={handleDecrease}
              disabled={units <= 1}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${units <= 1 ? 'bg-surface-muted text-disabled' : 'bg-surface-muted text-primary-strong hover:bg-primary-faint'}`}
            >
              <Minus size={24} />
            </button>

            <div className="flex flex-col items-center">
              <span className="text-display font-bold text-ink leading-none mb-1">{units}</span>
              <span className="text-copy-muted text-label font-medium uppercase tracking-wider">
                Units
              </span>
            </div>

            <button
              onClick={handleIncrease}
              disabled={units >= maxUnits}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${units >= maxUnits ? 'bg-surface-muted text-disabled' : 'bg-surface-muted text-primary-strong hover:bg-primary-faint'}`}
            >
              <Plus size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-6 pt-6 pb-safe-6 bg-surface border-t border-line z-20">
        <PrimaryButton onClick={() => void navigate('/duration')} withArrow>
          Continue
        </PrimaryButton>
      </div>
    </div>
  );
};

export default Details;
