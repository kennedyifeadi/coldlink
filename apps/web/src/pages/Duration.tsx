import React, { useState } from 'react';
import { Minus, Plus, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';

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
    <div className="flex flex-col h-full min-h-screen bg-white relative pb-28">
      {/* Top App Bar */}
      <TopNavBar title="Duration" showBack={true} />

      <div className="flex flex-col px-5 pt-8 flex-grow overflow-y-auto">
        {/* Header Content */}
        <div className="mb-6">
          <h1 className="text-[1.35rem] font-medium text-[#1a3622] mb-3">
            How long do you need storage?
          </h1>
          <p className="text-gray-600 text-[1.05rem] leading-relaxed">
            Select the number of days you need to store your goods.
          </p>
        </div>

        {/* Counter Control */}
        <div className="flex items-center justify-between bg-[#f8f9f7] rounded-2xl p-4 mb-8">
          <button
            onClick={handleDecrease}
            disabled={days <= 1}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-sm ${days <= 1 ? 'bg-white text-gray-300' : 'bg-white text-[#82b467] hover:bg-gray-50'}`}
          >
            <Minus size={24} strokeWidth={2.5} />
          </button>

          <div className="flex flex-col items-center">
            <span className="text-2xl font-bold text-[#1a3622] leading-none mb-1">{days}</span>
            <span className="text-gray-600 text-[0.8rem] font-medium uppercase tracking-widest">
              Days
            </span>
          </div>

          <button
            onClick={handleIncrease}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-white text-[#82b467] hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        </div>

        {/* Cost Breakdown Card */}
        <div className="bg-[#f8f9f7] rounded-2xl p-6 border border-gray-100">
          <h3 className="text-[#1a3622] text-[1.1rem] mb-5">Cost Breakdown</h3>

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-700 text-[1.05rem]">Storage</span>
              <span className="text-[#1a3622] text-[1.05rem]">₦{storageCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700 text-[1.05rem]">Delivery</span>
              <span className="text-[#1a3622] text-[1.05rem]">
                ₦{deliveryCost.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700 text-[1.05rem]">Booking fee</span>
              <span className="text-[#1a3622] text-[1.05rem]">₦{bookingFee.toLocaleString()}</span>
            </div>
          </div>

          <div className="h-[1px] bg-gray-200 mb-5 w-full"></div>

          <div className="flex justify-between items-center mb-6">
            <span className="text-gray-800 text-[1.1rem]">Total</span>
            <span className="text-[#82b467] text-[1.1rem]">₦{totalCost.toLocaleString()}</span>
          </div>

          {/* Info Alert inside Card */}
          <div className="bg-white rounded-xl p-4 flex gap-3 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <Info size={18} className="text-[#82b467] shrink-0 mt-0.5" />
            <p className="text-gray-700 text-[0.95rem] leading-relaxed">
              Delivery is calculated based on the distance between your location and the cold room.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-6 bg-gradient-to-t from-white via-white to-transparent z-20 pb-safe">
        <button
          onClick={() => void navigate('/review')}
          className="w-full py-4 rounded-xl bg-[#82b467] hover:bg-[#7ba962] text-white font-medium text-[1.1rem] transition-colors shadow-sm"
        >
          Continue to payment
        </button>
      </div>
    </div>
  );
};

export default Duration;
