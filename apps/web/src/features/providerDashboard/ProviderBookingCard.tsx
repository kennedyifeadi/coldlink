import React from 'react';
import { CalendarDays, ChevronRight, Hourglass, Leaf, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ProviderBooking } from '@coldlink/shared';
import Card from '../../components/ui/Card';
import { formatDate, formatKobo, formatLagosTime } from '../../i18n/format';
import { providerBookingPath } from '../../session/routes';
import StatusBadge from '../booking/StatusBadge';
import { formatAmount } from '../search/units';

/** What the provider has to do next for this booking, if anything. */
const NextStep = ({ booking }: { booking: ProviderBooking }) => {
  const { t } = useTranslation();

  if (booking.status === 'pending_provider' && booking.provider_response_due_at) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-accent-faint text-accent-ink px-3 py-2 text-body font-semibold">
        <Hourglass size={16} className="shrink-0" aria-hidden="true" />
        {t('provider.card.answerBy', formatLagosTime(booking.provider_response_due_at))}
      </p>
    );
  }
  if (booking.status === 'in_storage') {
    return (
      <p className="flex items-center gap-2 text-ink text-body font-semibold">
        <Wallet size={16} className="text-primary shrink-0" aria-hidden="true" />
        {t('provider.card.toCollect', { amount: formatKobo(booking.balance_due_kobo) })}
      </p>
    );
  }
  return null;
};

const ProviderBookingCard = ({ booking }: { booking: ProviderBooking }) => {
  const { t } = useTranslation();

  return (
    <Card className="p-5">
      <Link
        to={providerBookingPath(booking.provider.id, booking.id)}
        className="group flex flex-col gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-strong"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-primary-strong font-bold text-lead tracking-widest">
            {booking.code}
          </span>
          <StatusBadge status={booking.status} viewer="provider" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2 min-w-0">
            <p className="flex items-center gap-2 text-ink text-body font-medium">
              <Leaf size={16} className="text-primary shrink-0" aria-hidden="true" />
              {t('provider.card.produce', {
                produce: booking.crop.name,
                amount: formatAmount(booking.quantity, booking.capacity_unit, t),
              })}
            </p>
            <p className="flex items-center gap-2 text-copy-muted text-body">
              <CalendarDays size={16} className="text-primary shrink-0" aria-hidden="true" />
              {t('provider.card.dates', {
                start: formatDate(booking.start_date),
                end: formatDate(booking.end_date),
              })}
            </p>
          </div>
          <ChevronRight
            size={20}
            className="text-copy-subtle shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
        <NextStep booking={booking} />
      </Link>
    </Card>
  );
};

export default ProviderBookingCard;
