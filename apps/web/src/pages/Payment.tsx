import React, { useState } from 'react';
import {
  ReceiptText,
  CreditCard,
  Landmark,
  Grip,
  HelpCircle,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';

type PaymentMethod = 'card' | 'transfer' | 'ussd';

const Payment = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PaymentMethod>('card');
  const [saveCard, setSaveCard] = useState(false);

  return (
    <div className="flex flex-col h-full min-h-screen bg-white relative pb-10">
      {/* Top App Bar */}
      <TopNavBar title="Payment" showBack={true} />

      <div className="flex flex-col px-5 pt-6 flex-grow overflow-y-auto">
        {/* Order Summary Box */}
        <div className="bg-[#f8f9f7] rounded-2xl p-6 mb-6 flex flex-col items-center justify-center text-center">
          <p className="text-gray-600 text-[0.95rem] mb-1">Total to pay</p>
          <p className="text-[#82b467] text-2xl font-semibold mb-3">₦2,700</p>
          <div className="flex items-center text-gray-500 text-sm">
            <ReceiptText size={14} className="mr-1.5" /> Order #882-991A
          </div>
        </div>

        {/* Payment Method Tabs */}
        <div className="flex justify-between gap-3 mb-8">
          <button
            onClick={() => setActiveTab('card')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[0.95rem] font-medium transition-colors ${
              activeTab === 'card'
                ? 'bg-[#82b467] text-white shadow-sm'
                : 'bg-[#f8f9f7] text-gray-700 hover:bg-gray-100'
            }`}
          >
            <CreditCard size={18} /> Card
          </button>

          <button
            onClick={() => setActiveTab('transfer')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[0.95rem] font-medium transition-colors ${
              activeTab === 'transfer'
                ? 'bg-[#82b467] text-white shadow-sm'
                : 'bg-[#f8f9f7] text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Landmark size={18} /> Transfer
          </button>

          <button
            onClick={() => setActiveTab('ussd')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[0.95rem] font-medium transition-colors ${
              activeTab === 'ussd'
                ? 'bg-[#82b467] text-white shadow-sm'
                : 'bg-[#f8f9f7] text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Grip size={18} /> USSD
          </button>
        </div>

        {/* Card Form */}
        {activeTab === 'card' && (
          <div className="flex flex-col gap-5 mb-8">
            {/* Card Number */}
            <div className="flex flex-col gap-2">
              <label className="text-[#1a3622] text-sm font-medium">Card Number</label>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-gray-400">
                  <CreditCard size={20} />
                </div>
                <input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-100 rounded-xl text-[0.95rem] outline-none focus:border-[#82b467] focus:ring-1 focus:ring-[#82b467] transition-all"
                />
                <div className="absolute right-4 w-8 h-5 bg-gray-300 rounded-sm opacity-50">
                  {/* Fake Mastercard/Visa Icon Placeholder */}
                  <div className="flex w-full h-full items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-red-400 opacity-80 -mr-1"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-80"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              {/* Expiry Date */}
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-[#1a3622] text-sm font-medium">Expiry Date</label>
                <input
                  type="text"
                  placeholder="MM/YY"
                  className="w-full px-4 py-3.5 bg-white border border-gray-100 rounded-xl text-[0.95rem] outline-none focus:border-[#82b467] focus:ring-1 focus:ring-[#82b467] transition-all text-center placeholder:text-gray-300"
                />
              </div>

              {/* CVV */}
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-[#1a3622] text-sm font-medium">CVV</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="123"
                    className="w-full pl-4 pr-10 py-3.5 bg-white border border-gray-100 rounded-xl text-[0.95rem] outline-none focus:border-[#82b467] focus:ring-1 focus:ring-[#82b467] transition-all text-center placeholder:text-gray-300"
                  />
                  <div className="absolute right-4 text-gray-400">
                    <HelpCircle size={16} />
                  </div>
                </div>
              </div>
            </div>

            {/* Save Card Checkbox */}
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => setSaveCard(!saveCard)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                  saveCard ? 'bg-[#82b467] border-[#82b467]' : 'border-gray-300 bg-white'
                }`}
              >
                {saveCard && <div className="w-2.5 h-2.5 bg-white rounded-sm"></div>}
              </button>
              <span className="text-sm text-gray-700">Save card for future payments</span>
            </div>
          </div>
        )}

        {activeTab !== 'card' && (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <p>Select card to view the mock flow.</p>
          </div>
        )}
      </div>

      {/* Bottom Fixed Action Area */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-6 bg-gradient-to-t from-white via-white to-transparent z-20 pb-safe">
        <div className="flex justify-center items-center gap-1.5 text-gray-500 text-xs mb-4">
          <Lock size={12} />
          <span>Secured by Paystack. 256-bit encryption.</span>
        </div>

        <button
          onClick={() => void navigate('/confirmation')}
          className="group flex items-center justify-center w-full py-4 rounded-lg bg-[#82b467] hover:bg-[#7ba962] text-white font-medium text-lg transition-colors shadow-md"
        >
          <span>Pay ₦2,700</span>
          <ArrowRight
            size={20}
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
          />
        </button>
      </div>
    </div>
  );
};

export default Payment;
