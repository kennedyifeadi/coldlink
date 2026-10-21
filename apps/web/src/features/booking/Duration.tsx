import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import QuantityStepper from '../../components/ui/QuantityStepper';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatNaira } from '../../i18n/format';

const Duration = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [days, setDays] = useState(3);

  const storageCost = days * 1500;
  const deliveryCost = 800;
  const bookingFee = 100;
  const totalCost = storageCost + deliveryCost + bookingFee;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      {/* Top App Bar */}
      <TopNavBar title={t('booking.duration.navTitle')} showBack={true} />

      <div className="flex flex-col px-5 pt-8 flex-grow overflow-y-auto">
        {/* Header Content */}
        <div className="mb-6">
          <h1 className="font-heading text-title font-medium text-ink mb-3">
            {t('booking.duration.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">{t('booking.duration.intro')}</p>
        </div>

        <div className="mb-8">
          <QuantityStepper
            value={days}
            onChange={setDays}
            label={t('booking.duration.daysLabel')}
            decreaseLabel={t('booking.duration.removeDay')}
            increaseLabel={t('booking.duration.addDay')}
          />
        </div>

        <Card tone="muted" className="p-6">
          <CardTitle>{t('booking.duration.costTitle')}</CardTitle>

          <div className="flex flex-col gap-4 mb-6">
            <SummaryRow label={t('booking.duration.storage')} value={formatNaira(storageCost)} />
            <SummaryRow label={t('booking.duration.delivery')} value={formatNaira(deliveryCost)} />
            <SummaryRow label={t('booking.duration.bookingFee')} value={formatNaira(bookingFee)} />
          </div>

          <div className="h-[1px] bg-line-strong mb-5 w-full"></div>

          <div className="mb-6">
            <SummaryRow
              label={t('booking.duration.total')}
              value={formatNaira(totalCost)}
              variant="total"
            />
          </div>

          {/* Info Alert inside Card */}
          <div className="bg-surface rounded-xl p-4 flex gap-3 shadow-card">
            <Info size={18} className="text-primary shrink-0 mt-0.5" />
            <p className="text-copy-muted text-body leading-relaxed">
              {t('booking.duration.deliveryInfo')}
            </p>
          </div>
        </Card>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={() => void navigate('/review')}>
          {t('booking.duration.continueToPayment')}
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Duration;
