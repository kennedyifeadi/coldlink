import React, { useState } from 'react';
import { Minus, Plus, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../../components/TopNavBar';
import PrimaryButton from '../../components/ui/PrimaryButton';

const Duration = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState(3);

  const storageCost = days * 1500;
  const deliveryCost = 800;
  const bookingFee = 100;
  const totalCost = storageCost + deliveryCost + bookingFee;

  const handleDecrease = () => {
    if (days > 1) setDays(days - 1);
  };

  const handleIncrease = () => {
    setDays(days + 1);
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      {/* Top App Bar */}
      <TopNavBar title="Duration" showBack={true} />

      <div className="flex flex-col px-5 pt-8 flex-grow overflow-y-auto">
        {/* Header Content */}
        <div className="mb-6">
          <h1 className="font-heading text-title font-medium text-ink mb-3">
            How long do you need storage?
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">
            Select the number of days you need to store your goods.
          </p>
        </div>

        {/* Counter Control */}
        <div className="flex items-center justify-between bg-surface-muted rounded-2xl p-4 mb-8">
          <button
            onClick={handleDecrease}
            disabled={days <= 1}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-sm ${days <= 1 ? 'bg-surface text-disabled' : 'bg-surface text-primary-strong hover:bg-primary-faint'}`}
          >
            <Minus size={24} strokeWidth={2.5} />
          </button>

          <div className="flex flex-col items-center">
            <span className="text-headline font-bold text-ink leading-none mb-1">{days}</span>
            <span className="text-copy-muted text-caption font-medium uppercase tracking-widest">
              Days
            </span>
          </div>

          <button
            onClick={handleIncrease}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-surface text-primary-strong hover:bg-primary-faint transition-colors shadow-sm"
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        </div>

        {/* Cost Breakdown Card */}
        <div className="bg-surface-muted rounded-2xl p-6 border border-line">
          <h3 className="font-heading text-ink text-subtitle mb-5">Cost Breakdown</h3>

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-copy-muted text-lead">Storage</span>
              <span className="text-ink text-lead">₦{storageCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-copy-muted text-lead">Delivery</span>
              <span className="text-ink text-lead">₦{deliveryCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-copy-muted text-lead">Booking fee</span>
              <span className="text-ink text-lead">₦{bookingFee.toLocaleString()}</span>
            </div>
          </div>

          <div className="h-[1px] bg-line-strong mb-5 w-full"></div>

          <div className="flex justify-between items-center mb-6">
            <span className="text-copy text-subtitle">Total</span>
            <span className="text-primary-strong text-subtitle">₦{totalCost.toLocaleString()}</span>
          </div>

          {/* Info Alert inside Card */}
          <div className="bg-surface rounded-xl p-4 flex gap-3 shadow-card">
            <Info size={18} className="text-primary shrink-0 mt-0.5" />
            <p className="text-copy-muted text-body leading-relaxed">
              Delivery is calculated based on the distance between your location and the cold room.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-6 pt-6 pb-safe-6 bg-surface border-t border-line z-20">
        <PrimaryButton onClick={() => void navigate('/review')}>Continue to payment</PrimaryButton>
      </div>
    </div>
  );
};

export default Duration;
