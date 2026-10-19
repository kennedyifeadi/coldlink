import React, { useState } from 'react';
import { MapPin, Star, Snowflake, ShieldCheck, Minus, Plus, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';

const Details = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState(2);
  const maxUnits = 10;
  const pricePerUnit = 1500;

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
        {/* Hero Image Card */}
        <div className="relative w-full h-64 rounded-2xl overflow-hidden mb-6 shadow-sm">
          <img
            src="https://images.unsplash.com/photo-1586528116311-ad8ed7c83a7f?q=80&w=800&auto=format&fit=crop"
            alt="Cold Storage Facility"
            className="w-full h-full object-cover"
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>

          {/* Hero Content */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
            <div className="text-white">
              <h1 className="font-heading text-headline font-bold mb-1 leading-tight text-white drop-shadow-md">
                Abuja Central Cold Hub
              </h1>
              <div className="flex items-center text-white/85 text-label">
                <MapPin size={14} className="mr-1" /> Garki Area 1, Abuja
              </div>
            </div>
            <div className="flex items-center gap-1 bg-surface text-ink px-2.5 py-1 rounded-md text-label font-bold shadow-md shrink-0">
              <Star size={14} className="fill-accent text-accent" /> 4.8
            </div>
          </div>
        </div>

        {/* Storage Capacity Section */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-card mb-8">
          <div className="flex justify-between items-end mb-2">
            <span className="font-heading font-semibold text-ink text-subtitle">
              Storage Capacity
            </span>
            <span className="text-copy-muted text-body">10 of 20 units available</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-line-strong rounded-full mb-5 overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: '50%' }}></div>
          </div>

          {/* Features Pills */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 bg-primary-faint text-ink px-3 py-1.5 rounded-full text-label font-medium">
              <Snowflake size={14} className="text-primary" /> Frozen (-18°C)
            </div>
            <div className="flex items-center gap-1.5 bg-primary-faint text-ink px-3 py-1.5 rounded-full text-label font-medium">
              <ShieldCheck size={14} className="text-primary" /> Insured
            </div>
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
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-6 bg-gradient-to-t from-background via-background to-transparent z-20 pb-safe">
        <button
          onClick={() => void navigate('/duration')}
          className="group flex items-center justify-center w-full py-4 rounded-lg bg-primary hover:bg-primary-hover text-ink font-medium text-subtitle transition-colors shadow-md"
        >
          <span>Continue</span>
          <ArrowRight
            size={20}
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
          />
        </button>
      </div>
    </div>
  );
};

export default Details;
