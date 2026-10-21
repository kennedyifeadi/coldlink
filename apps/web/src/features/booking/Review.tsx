import React from 'react';
import { MapPin, Info, Snowflake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sampleColdRoom as room } from '../../data/mockData';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';

const Review = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      {/* Top App Bar */}
      <TopNavBar title={t('booking.review.navTitle')} showProfile={true} />

      <div className="flex flex-col px-5 pt-6 pb-6 flex-grow overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-2 tracking-tight">
            {t('booking.review.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">{t('booking.review.intro')}</p>
        </div>

        <Card tone="muted" className="p-5 mb-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-ink shrink-0">
              <Snowflake size={20} />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-ink text-lead">{room.name}</h2>
              <div className="flex items-center text-copy-subtle text-label mt-0.5">
                <MapPin size={12} className="mr-1" />{' '}
                {t('booking.review.roomLocation', {
                  location: room.location,
                  distance: room.distance,
                })}
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl p-4 border border-line flex flex-col gap-3">
            <SummaryRow label={t('booking.review.produce')} value="Tomato" />
            <SummaryRow
              label={t('booking.review.quantity')}
              value={t('booking.review.quantityValue', { count: 2, weight: 100 })}
            />
            <SummaryRow
              label={t('booking.review.duration')}
              value={t('booking.review.durationValue', { count: 3 })}
            />
          </div>
        </Card>

        <Card tone="muted" className="p-5 mb-4">
          <CardTitle>{t('booking.review.costTitle')}</CardTitle>

          <div className="flex flex-col gap-3 mb-4">
            <SummaryRow label={t('booking.review.storage', { count: 3 })} value="₦4,500" />
            <SummaryRow label={t('booking.review.delivery')} value="₦600" />
            <SummaryRow label={t('booking.review.serviceFee')} value="₦300" />
          </div>

          <div className="h-[1px] bg-line-strong mb-4 w-full"></div>

          <SummaryRow label={t('booking.review.total')} value="₦5,400" variant="total" />
        </Card>

        {/* Split Payment Plan Card */}
        <div className="bg-accent rounded-2xl p-5 mb-8">
          <div className="flex items-start gap-2 mb-4">
            <Info size={18} className="text-accent-ink shrink-0 mt-0.5" />
            <div>
              <h4 className="font-heading font-semibold text-accent-ink mb-1">
                {t('booking.review.splitTitle')}
              </h4>
              <p className="text-accent-ink text-body leading-relaxed">
                {t('booking.review.splitBody')}
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center bg-accent-soft rounded-xl p-4">
            <div className="flex flex-col">
              <span className="text-accent-ink text-caption font-medium mb-1">
                {t('booking.review.payNow')}
              </span>
              <span className="font-bold text-title text-accent-ink">₦2,700</span>
            </div>
            <div className="w-[1px] h-10 bg-accent mx-4"></div>
            <div className="flex flex-col">
              <span className="text-accent-ink text-caption font-medium mb-1">
                {t('booking.review.balance')}
              </span>
              <span className="font-bold text-title text-accent-ink">₦2,700</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4">
          <PrimaryButton onClick={() => void navigate('/payment')} withArrow>
            {t('booking.payAmount', { amount: '₦2,700' })}
          </PrimaryButton>
          <button
            onClick={() => void navigate(-1)}
            className="w-full py-3 text-primary-strong font-medium text-lead hover:bg-surface-muted rounded-lg transition-colors"
          >
            {t('booking.review.edit')}
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab="bookings" />
    </div>
  );
};

export default Review;
