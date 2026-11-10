import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';

// Holds the route that Home and the bottom bar link to until the bookings list is built (#35).
const MyBookings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      <TopNavBar title={t('booking.myBookings.navTitle')} />

      <div className="flex flex-col items-center text-center px-6 pt-12 mb-auto">
        <div className="w-20 h-20 mb-8 bg-surface-muted rounded-full flex items-center justify-center text-primary-strong">
          <ShoppingBag size={32} aria-hidden="true" />
        </div>
        <h1 className="font-heading text-headline font-bold text-ink mb-3">
          {t('booking.myBookings.title')}
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed max-w-sm">
          {t('booking.myBookings.body')}
        </p>
      </div>

      <div className="px-6 mt-12 mb-6">
        <PrimaryButton onClick={() => void navigate('/')}>
          {t('booking.myBookings.findStorage')}
        </PrimaryButton>
      </div>

      <BottomNav activeTab="bookings" />
    </div>
  );
};

export default MyBookings;
