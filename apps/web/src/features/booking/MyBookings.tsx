import React from 'react';
import { CalendarDays, ChevronRight, CircleAlert, Leaf, ShoppingBag, WifiOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { FarmerBookingSummary } from '@coldlink/shared';
import { myBookingsQuery } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import BottomNav from '../../components/BottomNav';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatDate } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import { bookingDetailPath } from '../../session/routes';
import { SEARCH_STEPS } from '../search/searchFlow';
import { formatAmount } from '../search/units';
import BookAgainButton from './BookAgainButton';
import { canBookAgain } from './bookingStatus';
import BookingCountdown from './BookingCountdown';
import StatusBadge from './StatusBadge';

const BookingCard = ({ booking }: { booking: FarmerBookingSummary }) => {
  const { t } = useTranslation();
  const { provider } = booking;

  return (
    <li>
      <Card className="p-5">
        <Link
          to={bookingDetailPath(booking.id)}
          className="group flex flex-col gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-strong"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-primary-strong font-bold text-lead tracking-widest">
              {booking.code}
            </span>
            <StatusBadge status={booking.status} />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading font-semibold text-ink text-subtitle">
                {provider.display_name}
              </h2>
              {provider.lga && (
                <p className="text-copy-subtle text-label">
                  {t('booking.detail.lga', { lga: provider.lga })}
                </p>
              )}
            </div>
            <ChevronRight
              size={20}
              className="text-copy-subtle shrink-0 mt-1 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <p className="flex items-center gap-2 text-copy-muted text-body">
            <Leaf size={16} className="text-primary shrink-0" aria-hidden="true" />
            {t('booking.confirmation.produceValue', {
              produce: booking.crop.name,
              amount: formatAmount(booking.quantity, booking.capacity_unit, t),
            })}
          </p>
          <p className="flex items-center gap-2 text-copy-muted text-body">
            <CalendarDays size={16} className="text-primary shrink-0" aria-hidden="true" />
            {t('booking.myBookings.dates', {
              start: formatDate(booking.start_date),
              end: formatDate(booking.end_date),
            })}
          </p>
          <BookingCountdown booking={booking} />
        </Link>
        {canBookAgain(booking) && (
          <div className="mt-4 pt-4 border-t border-line">
            <BookAgainButton booking={booking} />
          </div>
        )}
      </Card>
    </li>
  );
};

const NoBookings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center pt-6">
      <div className="w-20 h-20 mb-8 bg-surface-muted rounded-full flex items-center justify-center text-primary-strong">
        <ShoppingBag size={32} aria-hidden="true" />
      </div>
      <h2 className="font-heading text-headline font-bold text-ink mb-3">
        {t('booking.myBookings.emptyTitle')}
      </h2>
      <p className="text-copy-muted text-lead leading-relaxed max-w-sm mb-10">
        {t('booking.myBookings.emptyBody')}
      </p>
      <PrimaryButton onClick={() => void navigate(SEARCH_STEPS.place)}>
        {t('booking.myBookings.findStorage')}
      </PrimaryButton>
    </div>
  );
};

const LoadingBookings = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-copy-muted text-body text-center">
        {t('booking.myBookings.loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-52 rounded-2xl bg-surface-muted" />
        <div className="h-52 rounded-2xl bg-surface-muted" />
      </div>
    </div>
  );
};

interface BookingsFailedProps {
  error: unknown;
  retry: () => void;
  retrying: boolean;
}

const BookingsFailed = ({ error, retry, retrying }: BookingsFailedProps) => {
  const { t } = useTranslation();
  const Icon = isApiError(error, 'network') ? WifiOff : CircleAlert;

  return (
    <div className="flex flex-col items-center text-center pt-6">
      <div className="w-20 h-20 mb-8 bg-surface-muted rounded-full flex items-center justify-center text-primary-strong">
        <Icon size={32} aria-hidden="true" />
      </div>
      <h2 className="font-heading text-headline font-bold text-ink mb-3">
        {t('booking.myBookings.failedTitle')}
      </h2>
      <p role="alert" className="text-copy-muted text-lead leading-relaxed max-w-sm mb-10">
        {describeApiError(error, t)}
      </p>
      <PrimaryButton onClick={retry} disabled={retrying}>
        {t('common.tryAgain')}
      </PrimaryButton>
    </div>
  );
};

/** The farmer's bookings, newest first, each with its status and code (PRD 7.9). */
const MyBookings = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const query = useQuery(myBookingsQuery(store.authorizedRequest));

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      <TopNavBar title={t('booking.myBookings.navTitle')} />

      <div className="flex flex-col px-5 pt-6">
        <h1 className="font-heading text-headline font-bold text-ink mb-6">
          {t('booking.myBookings.title')}
        </h1>
        {query.isError ? (
          <BookingsFailed
            error={query.error}
            retry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : query.data === undefined ? (
          <LoadingBookings />
        ) : query.data.data.length === 0 ? (
          <NoBookings />
        ) : (
          <ul className="flex flex-col gap-4">
            {query.data.data.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </ul>
        )}
      </div>

      <BottomNav activeTab="bookings" />
    </div>
  );
};

export default MyBookings;
