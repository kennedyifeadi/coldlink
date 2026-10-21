import React from 'react';
import { CheckCircle2, Home, MapPin, Leaf, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoMain from '../../assets/logo_main.webp';
import { sampleColdRoom as room } from '../../data/mockData';
import Card from '../../components/ui/Card';
import SummaryRow from '../../components/ui/SummaryRow';
import PrimaryButton from '../../components/ui/PrimaryButton';

const Confirmation = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-10">
      {/* Top Header - Just Logo Centered */}
      <div className="flex justify-center items-center px-4 py-6">
        <img src={logoMain} alt={t('common.logoAlt')} width={138} height={32} />
      </div>

      <div className="flex flex-col px-5 pt-2 flex-grow overflow-y-auto">
        {/* Success Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-primary-faint rounded-full flex items-center justify-center text-primary-strong mb-4">
            <CheckCircle2 size={32} strokeWidth={2.5} />
          </div>
          <h1 className="font-heading text-title font-bold text-ink mb-2">
            {t('booking.confirmation.title')}
          </h1>
          <p className="text-copy-muted text-body">{t('booking.confirmation.sent')}</p>
        </div>

        <Card className="p-6 mb-4 text-center flex flex-col items-center">
          <h2 className="text-copy-muted text-label font-medium tracking-widest uppercase mb-4">
            {t('booking.confirmation.codeTitle')}
          </h2>
          <div className="border border-primary-soft text-primary-strong font-bold text-headline tracking-widest py-3 px-8 rounded-xl mb-4 inline-block bg-surface">
            CL-847291
          </div>
          <p className="text-copy-muted text-body">{t('booking.confirmation.codeHint')}</p>
        </Card>

        <Card className="p-6 mb-4">
          <h3 className="text-copy-muted text-label font-medium mb-5">
            {t('booking.confirmation.detailsTitle')}
          </h3>

          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <Home size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">{t('booking.confirmation.coldRoom')}</p>
                <p className="text-copy-muted text-body">{room.name}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <MapPin size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">{t('booking.confirmation.location')}</p>
                <p className="text-copy-muted text-body">{room.location}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <Leaf size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">{t('booking.confirmation.produce')}</p>
                <p className="text-copy-muted text-body">
                  {t('booking.confirmation.produceValue', { produce: 'Tomatoes', count: 50 })}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <CalendarDays size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">{t('booking.confirmation.duration')}</p>
                <p className="text-copy-muted text-body">
                  {t('booking.confirmation.durationValue', { dates: 'Oct 12 - Oct 15', count: 3 })}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-8">
          <h3 className="text-copy-muted text-label font-medium mb-5">
            {t('booking.confirmation.paymentTitle')}
          </h3>

          <div className="flex flex-col gap-3.5 mb-4">
            <SummaryRow label={t('booking.confirmation.totalCost')} value="₦5,400" />
            <SummaryRow
              label={t('booking.confirmation.amountPaid')}
              value={t('booking.confirmation.amountPaidValue', { amount: '₦2,700' })}
              variant="highlight"
            />
          </div>

          <div className="h-[1px] bg-line mb-4 w-full"></div>

          <div className="mb-1.5">
            <SummaryRow label={t('booking.confirmation.balanceDue')} value="₦2,700" />
          </div>
          <div className="text-right">
            <span className="text-copy-subtle text-caption">
              {t('booking.confirmation.balanceHint')}
            </span>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 mt-auto">
          <PrimaryButton onClick={() => void navigate('/discovery')} withArrow>
            {t('booking.confirmation.viewBooking')}
          </PrimaryButton>
          <button
            onClick={() => void navigate('/discovery')}
            className="w-full py-4 bg-surface border border-line-strong text-ink font-medium text-lead hover:bg-surface-muted rounded-lg transition-colors"
          >
            {t('booking.confirmation.backHome')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;
