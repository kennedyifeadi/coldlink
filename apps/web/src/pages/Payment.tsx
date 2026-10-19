import React, { useState } from 'react';
import { ReceiptText, CreditCard, Landmark, Grip, HelpCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';

type PaymentMethod = 'card' | 'transfer' | 'ussd';

const Payment = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PaymentMethod>('card');
  const [saveCard, setSaveCard] = useState(false);

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-10">
      {/* Top App Bar */}
      <TopNavBar title="Payment" showBack={true} />

      <div className="flex flex-col px-5 pt-6 flex-grow overflow-y-auto">
        {/* Order Summary Box */}
        <div className="bg-surface-muted rounded-2xl p-6 mb-6 flex flex-col items-center justify-center text-center">
          <p className="text-copy-muted text-body mb-1">Total to pay</p>
          <p className="text-primary-strong text-headline font-semibold mb-3">₦2,700</p>
          <div className="flex items-center text-copy-subtle text-label">
            <ReceiptText size={14} className="mr-1.5" /> Order #882-991A
          </div>
        </div>

        {/* Payment Method Tabs */}
        <div className="flex justify-between gap-3 mb-8">
          <button
            onClick={() => setActiveTab('card')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-label font-medium transition-colors ${
              activeTab === 'card'
                ? 'bg-primary text-ink shadow-sm'
                : 'bg-surface-muted text-copy-muted hover:bg-surface-sunken'
            }`}
          >
            <CreditCard size={18} /> Card
          </button>

          <button
            onClick={() => setActiveTab('transfer')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-label font-medium transition-colors ${
              activeTab === 'transfer'
                ? 'bg-primary text-ink shadow-sm'
                : 'bg-surface-muted text-copy-muted hover:bg-surface-sunken'
            }`}
          >
            <Landmark size={18} /> Transfer
          </button>

          <button
            onClick={() => setActiveTab('ussd')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-label font-medium transition-colors ${
              activeTab === 'ussd'
                ? 'bg-primary text-ink shadow-sm'
                : 'bg-surface-muted text-copy-muted hover:bg-surface-sunken'
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
              <label className="text-ink text-label font-medium">Card Number</label>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-copy-subtle">
                  <CreditCard size={20} />
                </div>
                <input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  className="w-full pl-12 pr-4 py-3.5 bg-surface border border-line rounded-xl text-body placeholder:text-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all"
                />
              </div>
            </div>

            <div className="flex gap-4">
              {/* Expiry Date */}
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-ink text-label font-medium">Expiry Date</label>
                <input
                  type="text"
                  placeholder="MM/YY"
                  className="w-full px-4 py-3.5 bg-surface border border-line rounded-xl text-body placeholder:text-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all text-center"
                />
              </div>

              {/* CVV */}
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-ink text-label font-medium">CVV</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="123"
                    className="w-full pl-4 pr-10 py-3.5 bg-surface border border-line rounded-xl text-body placeholder:text-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all text-center"
                  />
                  <div className="absolute right-4 text-copy-subtle">
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
                  saveCard ? 'bg-primary border-primary-strong' : 'border-line-strong bg-surface'
                }`}
              >
                {saveCard && <div className="w-2.5 h-2.5 bg-ink rounded-sm"></div>}
              </button>
              <span className="text-body text-copy-muted">Save card for future payments</span>
            </div>
          </div>
        )}

        {activeTab !== 'card' && (
          <div className="flex items-center justify-center py-10 text-copy-subtle">
            <p>Select card to view the mock flow.</p>
          </div>
        )}
      </div>

      {/* Bottom Fixed Action Area */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-6 bg-surface border-t border-line z-20 pb-safe">
        <button
          onClick={() => void navigate('/confirmation')}
          className="group flex items-center justify-center w-full py-4 rounded-lg bg-primary hover:bg-primary-hover text-ink font-medium text-subtitle transition-colors shadow-md"
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
