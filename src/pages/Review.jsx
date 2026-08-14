import React from 'react';
import { MapPin, Info, ArrowRight, Snowflake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import BottomNav from '../components/BottomNav';

const Review = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full min-h-screen bg-white relative pb-20">
      
      {/* Top App Bar */}
      <TopNavBar title="Review" showProfile={true} />

      <div className="flex flex-col px-5 pt-6 pb-6 flex-grow overflow-y-auto">
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[1.65rem] font-bold text-[#1a3622] mb-2 tracking-tight">
            Review your booking
          </h1>
          <p className="text-gray-600 text-[1.05rem] leading-relaxed">
            Please confirm your storage details before payment.
          </p>
        </div>

        {/* Facility Details Card */}
        <div className="bg-[#f8f9f7] rounded-2xl p-5 mb-4 border border-gray-100">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-[#82b467] flex items-center justify-center text-[#1a3622] shrink-0">
              <Snowflake size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-[#1a3622] text-[1.05rem]">Mile 12 Mega Cold Store</h2>
              <div className="flex items-center text-gray-500 text-sm mt-0.5">
                <MapPin size={12} className="mr-1" /> Ketu, Lagos (2.4km)
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-100 flex flex-col gap-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Produce</span>
              <span className="font-semibold text-[#1a3622]">Tomato</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Quantity</span>
              <span className="font-semibold text-[#1a3622]">2 Crates (100kg)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Duration</span>
              <span className="font-semibold text-[#1a3622]">3 Days</span>
            </div>
          </div>
        </div>

        {/* Cost Summary Card */}
        <div className="bg-[#f8f9f7] rounded-2xl p-5 mb-4 border border-gray-100">
          <h3 className="font-semibold text-[#1a3622] mb-4">Cost Summary</h3>
          
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Storage (3 days)</span>
              <span className="text-gray-800">₦4,500</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Delivery</span>
              <span className="text-gray-800">₦600</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Service Fee</span>
              <span className="text-gray-800">₦300</span>
            </div>
          </div>

          <div className="h-[1px] bg-gray-200 mb-4 w-full"></div>

          <div className="flex justify-between items-center">
            <span className="font-bold text-lg text-[#1a3622]">Total</span>
            <span className="font-bold text-lg text-[#82b467]">₦5,400</span>
          </div>
        </div>

        {/* Split Payment Plan Card */}
        <div className="bg-[#fab94a] rounded-2xl p-5 mb-8">
          <div className="flex items-start gap-2 mb-4">
            <Info size={18} className="text-[#8c6b22] shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-[#8c6b22] mb-1">Split Payment Plan</h4>
              <p className="text-[#a47a1f] text-sm leading-relaxed">
                You'll pay 50% now to secure the space, and the remaining 50% according to the storage provider's arrangement.
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center bg-[#fac66b] rounded-xl p-4">
            <div className="flex flex-col">
              <span className="text-[#8c6b22] text-xs font-medium mb-1">Pay now (50%)</span>
              <span className="font-bold text-xl text-[#6d5115]">₦2,700</span>
            </div>
            <div className="w-[1px] h-10 bg-[#e5ad3c] mx-4"></div>
            <div className="flex flex-col">
              <span className="text-[#8c6b22] text-xs font-medium mb-1">Balance</span>
              <span className="font-bold text-xl text-[#6d5115]">₦2,700</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => navigate('/payment')}
            className="group flex items-center justify-center w-full py-4 rounded-lg bg-[#82b467] hover:bg-[#7ba962] text-white font-medium text-lg transition-colors shadow-md"
          >
            <span>Pay ₦2,700</span>
            <ArrowRight 
              size={20} 
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5" 
            />
          </button>
          <button 
            onClick={() => navigate(-1)}
            className="w-full py-3 text-[#82b467] font-medium text-[1.05rem] hover:bg-gray-50 rounded-lg transition-colors"
          >
            Edit booking
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab="bookings" />

    </div>
  );
};

export default Review;
