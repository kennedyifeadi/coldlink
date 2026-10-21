import React, { useState } from 'react';
import { ReceiptText, CreditCard, Landmark, Grip, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';

type PaymentMethod = 'card' | 'transfer' | 'ussd';

const Payment = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PaymentMethod>('card');
  const [saveCard, setSaveCard] = useState(false);

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      {/* Top App Bar */}
      <TopNavBar title="Payment" showBack={true} />

      <div className="flex flex-col px-5 pt-6 flex-grow overflow-y-auto">
        <Card
          tone="muted"
          className="p-6 mb-6 flex flex-col items-center justify-center text-center"
        >
          <p className="text-copy-muted text-body mb-1">Total to pay</p>
          <p className="text-primary-strong text-headline font-semibold mb-3">₦2,700</p>
          <div className="flex items-center text-copy-subtle text-label">
            <ReceiptText size={14} className="mr-1.5" /> Order #882-991A
          </div>
        </Card>

        {/* Payment Method Tabs */}
        <div className="flex justify-between gap-3 mb-8">
          <button
            onClick={() => setActiveTab('card')}
            aria-pressed={activeTab === 'card'}
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
            aria-pressed={activeTab === 'transfer'}
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
            aria-pressed={activeTab === 'ussd'}
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
              <label htmlFor="card-number" className="text-ink text-label font-medium">
                Card Number
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-copy-subtle">
                  <CreditCard size={20} />
                </div>
                <input
                  id="card-number"
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  className="w-full pl-12 pr-4 py-3.5 bg-surface border border-line rounded-xl text-body placeholder:text-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all"
                />
              </div>
            </div>

            <div className="flex gap-4">
              {/* Expiry Date */}
              <div className="flex flex-col gap-2 flex-1">
                <label htmlFor="card-expiry" className="text-ink text-label font-medium">
                  Expiry Date
                </label>
                <input
                  id="card-expiry"
                  type="text"
                  placeholder="MM/YY"
                  className="w-full px-4 py-3.5 bg-surface border border-line rounded-xl text-body placeholder:text-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all text-center"
                />
              </div>

              {/* CVV */}
              <div className="flex flex-col gap-2 flex-1">
                <label htmlFor="card-cvv" className="text-ink text-label font-medium">
                  CVV
                </label>
                <div className="relative flex items-center">
                  <input
                    id="card-cvv"
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

            <label className="relative flex items-center gap-3 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveCard}
                onChange={(e) => setSaveCard(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-strong ${
                  saveCard ? 'bg-primary border-primary-strong' : 'border-line-strong bg-surface'
                }`}
              >
                {saveCard && <span className="w-2.5 h-2.5 bg-ink rounded-sm"></span>}
              </span>
              <span className="text-body text-copy-muted">Save card for future payments</span>
            </label>
          </div>
        )}

        {activeTab !== 'card' && (
          <div className="flex items-center justify-center py-10 text-copy-subtle">
            <p>Select card to view the mock flow.</p>
          </div>
        )}
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={() => void navigate('/confirmation')} withArrow>
          Pay ₦2,700
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Payment;
