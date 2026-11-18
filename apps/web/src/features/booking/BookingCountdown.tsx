import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FarmerBookingSummary } from '@coldlink/shared';
import { formatDate } from '../../i18n/format';
import { storageCountdown } from './storageCountdown';

// The count is in days, so checking the clock once a minute keeps it right past midnight.
const CLOCK_CHECK_MS = 60_000;

const useNow = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
};

/** How long the produce has left in storage, for a booking that is in storage; otherwise nothing. */
const BookingCountdown = ({
  booking,
}: {
  booking: Pick<FarmerBookingSummary, 'status' | 'end_date'>;
}) => {
  const { t } = useTranslation();
  const now = useNow();
  if (booking.status !== 'in_storage') return null;
  const countdown = storageCountdown(booking.end_date, now);
  const text =
    countdown.kind === 'daysLeft'
      ? t('booking.myBookings.daysLeft', {
          count: countdown.days,
          date: formatDate(booking.end_date),
        })
      : countdown.kind === 'today'
        ? t('booking.myBookings.collectToday')
        : t('booking.myBookings.overdue', { count: countdown.days });

  return (
    <p
      className={`flex items-center gap-2 text-body font-semibold ${countdown.kind === 'overdue' ? 'text-alert-strong' : 'text-primary-strong'}`}
    >
      <Timer size={18} aria-hidden="true" className="shrink-0" />
      {text}
    </p>
  );
};

export default BookingCountdown;
