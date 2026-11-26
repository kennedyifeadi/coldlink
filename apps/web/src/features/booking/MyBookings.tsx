import React from 'react';
import { ChevronRight, CircleAlert, WifiOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { FarmerBookingSummary } from '@coldlink/shared';
import { myBookingsQuery } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import BottomNav from '../../components/BottomNav';
import TopNavBar from '../../components/TopNavBar';
import PageHeader from '../../components/ui/PageHeader';
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
    <li className="px-5 py-5">
      <Link
        to={bookingDetailPath(booking.id)}
        className="group flex flex-col gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <StatusBadge status={booking.status} />
          <span className="text-copy-muted font-semibold text-label tracking-wider tabular-nums">
            {booking.code}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h2 className="font-bold text-ink text-subtitle">{provider.display_name}</h2>
            {provider.lga && (
              <p className="text-copy-muted text-label">
                {t('booking.detail.lga', { lga: provider.lga })}
              </p>
            )}
            <p className="text-copy-muted text-label">
              {t('booking.confirmation.produceValue', {
                produce: booking.crop.name,
                amount: formatAmount(booking.quantity, booking.capacity_unit, t),
              })}
            </p>
            <p className="text-copy-muted text-label">
              {t('booking.myBookings.dates', {
                start: formatDate(booking.start_date),
                end: formatDate(booking.end_date),
              })}
            </p>
          </div>
          <ChevronRight
            size={20}
            className="text-copy-subtle shrink-0 mt-1 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
        <BookingCountdown booking={booking} />
      </Link>
      {canBookAgain(booking) && (
        <div className="mt-4">
          <BookAgainButton booking={booking} />
        </div>
      )}
    </li>
  );
};

const NoBookings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col px-5 pt-8">
      <h2 className="text-title font-bold text-ink mb-2">{t('booking.myBookings.emptyTitle')}</h2>
      <p className="text-copy-muted text-body mb-8">{t('booking.myBookings.emptyBody')}</p>
      <PrimaryButton onClick={() => void navigate(SEARCH_STEPS.place)}>
        {t('booking.myBookings.findStorage')}
      </PrimaryButton>
    </div>
  );
};

const LoadingBookings = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 px-5 pt-5">
      <p role="status" className="text-copy-muted text-label font-medium">
        {t('booking.myBookings.loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-32 rounded-xl bg-surface-muted" />
        <div className="h-32 rounded-xl bg-surface-muted" />
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
    <div className="flex flex-col px-5 pt-8">
      <Icon size={28} className="text-copy-muted mb-4" aria-hidden="true" />
      <h2 className="text-title font-bold text-ink mb-2">{t('booking.myBookings.failedTitle')}</h2>
      <p role="alert" className="text-copy-muted text-body mb-8">
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
    <div className="flex flex-col min-h-screen bg-background pb-28">
      <TopNavBar title={t('booking.myBookings.navTitle')} />
      <PageHeader title={t('booking.myBookings.title')} />

      <div className="flex flex-col">
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
          <ul className="divide-y divide-line border-b border-line">
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
