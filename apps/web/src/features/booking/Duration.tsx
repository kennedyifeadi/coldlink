import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import QuantityStepper from '../../components/ui/QuantityStepper';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';

const formatNaira = (amount: number) => `₦${amount.toLocaleString()}`;

const Duration = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState(3);

  const storageCost = days * 1500;
  const deliveryCost = 800;
  const bookingFee = 100;
  const totalCost = storageCost + deliveryCost + bookingFee;

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

        <div className="mb-8">
          <QuantityStepper
            value={days}
            onChange={setDays}
            label="Days"
            decreaseLabel="Remove a day"
            increaseLabel="Add a day"
          />
        </div>

        <Card tone="muted" className="p-6">
          <CardTitle>Cost Breakdown</CardTitle>

          <div className="flex flex-col gap-4 mb-6">
            <SummaryRow label="Storage" value={formatNaira(storageCost)} />
            <SummaryRow label="Delivery" value={formatNaira(deliveryCost)} />
            <SummaryRow label="Booking fee" value={formatNaira(bookingFee)} />
          </div>

          <div className="h-[1px] bg-line-strong mb-5 w-full"></div>

          <div className="mb-6">
            <SummaryRow label="Total" value={formatNaira(totalCost)} variant="total" />
          </div>

          {/* Info Alert inside Card */}
          <div className="bg-surface rounded-xl p-4 flex gap-3 shadow-card">
            <Info size={18} className="text-primary shrink-0 mt-0.5" />
            <p className="text-copy-muted text-body leading-relaxed">
              Delivery is calculated based on the distance between your location and the cold room.
            </p>
          </div>
        </Card>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={() => void navigate('/review')}>Continue to payment</PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Duration;
