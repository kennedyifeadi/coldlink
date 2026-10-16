import React from 'react';
import {
  CheckCircle2,
  Home,
  MapPin,
  Leaf,
  CalendarDays,
  ArrowRight,
  Snowflake,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Confirmation = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full min-h-screen bg-white relative pb-10">
      {/* Top Header - Just Logo Centered */}
      <div className="flex justify-center items-center px-4 py-6">
        <div className="flex items-center gap-1.5">
          <div className="bg-[#68a042] p-1.5 rounded-lg text-white flex items-center justify-center">
            <Snowflake size={18} />
          </div>
          <div className="flex flex-col">
            <div className="flex font-extrabold text-lg tracking-tight leading-none">
              <span className="text-[#1a3622]">Cold</span>
              <span className="text-[#ff9800]">Link</span>
            </div>
            <span className="text-[#1a3622] text-[0.45rem] font-bold tracking-[0.2em] mt-0.5">
              STORAGE, NEARBY
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col px-5 pt-2 flex-grow overflow-y-auto">
        {/* Success Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-[#f4f9f1] rounded-full flex items-center justify-center text-[#82b467] mb-4">
            <CheckCircle2 size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold text-[#1a3622] mb-2">Booking confirmed!</h1>
          <p className="text-gray-600 text-[0.95rem]">
            A confirmation has been sent to your phone.
          </p>
        </div>

        {/* Booking Code Card */}
        <div className="relative bg-white rounded-2xl p-6 mb-4 border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden text-center flex flex-col items-center">
          {/* Subtle background decoration */}
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-[#f8fbf6] rounded-full pointer-events-none"></div>

          <h2 className="text-gray-600 text-sm font-medium tracking-widest uppercase mb-4 relative z-10">
            Your Booking Code
          </h2>
          <div className="border border-[#e5f0df] text-[#82b467] font-bold text-2xl tracking-widest py-3 px-8 rounded-xl mb-4 inline-block bg-white relative z-10">
            CL-847291
          </div>
          <p className="text-gray-600 text-sm relative z-10">Show this code when you arrive</p>
        </div>

        {/* Booking Details Card */}
        <div className="bg-white rounded-2xl p-6 mb-4 border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <h3 className="text-gray-600 text-sm font-medium mb-5">Booking Details</h3>

          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <Home size={18} className="text-[#82b467] mt-0.5" />
              <div>
                <p className="text-[#1a3622] text-sm mb-0.5">Cold Room</p>
                <p className="text-gray-700 text-[0.95rem]">Standard Chilled Unit #4</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <MapPin size={18} className="text-[#82b467] mt-0.5" />
              <div>
                <p className="text-[#1a3622] text-sm mb-0.5">Location</p>
                <p className="text-gray-700 text-[0.95rem]">Kano Central Hub</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <Leaf size={18} className="text-[#82b467] mt-0.5" />
              <div>
                <p className="text-[#1a3622] text-sm mb-0.5">Produce</p>
                <p className="text-gray-700 text-[0.95rem]">Tomatoes (50 Crates)</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <CalendarDays size={18} className="text-[#82b467] mt-0.5" />
              <div>
                <p className="text-[#1a3622] text-sm mb-0.5">Duration</p>
                <p className="text-gray-700 text-[0.95rem]">Oct 12 - Oct 15 (3 days)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary Card */}
        <div className="bg-white rounded-2xl p-6 mb-8 border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <h3 className="text-gray-600 text-sm font-medium mb-5">Payment Summary</h3>

          <div className="flex flex-col gap-3.5 mb-4">
            <div className="flex justify-between items-center text-[0.95rem]">
              <span className="text-gray-600">Total Cost</span>
              <span className="text-[#1a3622] font-medium">₦5,400</span>
            </div>
            <div className="flex justify-between items-center text-[0.95rem]">
              <span className="text-[#82b467]">Amount Paid</span>
              <span className="text-[#82b467] font-medium">- ₦2,700</span>
            </div>
          </div>

          <div className="h-[1px] bg-gray-100 mb-4 w-full"></div>

          <div className="flex justify-between items-center mb-1.5">
            <span className="text-gray-600 text-[0.95rem]">Balance Due</span>
            <span className="font-medium text-[#1a3622] text-[0.95rem]">₦2,700</span>
          </div>
          <div className="text-right">
            <span className="text-gray-500 text-xs">To be paid on arrival</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 mt-auto">
          <button
            onClick={() => void navigate('/discovery')}
            className="group flex items-center justify-center w-full py-4 rounded-lg bg-[#82b467] hover:bg-[#7ba962] text-white font-medium text-lg transition-colors shadow-md"
          >
            <span>View booking</span>
            <ArrowRight
              size={20}
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
            />
          </button>
          <button
            onClick={() => void navigate('/discovery')}
            className="w-full py-4 bg-white border border-gray-200 text-[#1a3622] font-medium text-[1.05rem] hover:bg-gray-50 rounded-lg transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;
