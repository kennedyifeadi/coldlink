import React from 'react';
import { ChevronRight, Hourglass, Wallet } from 'lucide-react';
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
      <p className="flex items-center gap-2 rounded-lg bg-accent-faint text-accent-ink px-3 py-2 text-label font-semibold">
        <Hourglass size={16} className="shrink-0" aria-hidden="true" />
        {t('provider.card.answerBy', formatLagosTime(booking.provider_response_due_at))}
      </p>
    );
  }
  if (booking.status === 'in_storage') {
    return (
      <p className="flex items-center gap-2 text-primary-strong text-label font-semibold">
        <Wallet size={16} className="shrink-0" aria-hidden="true" />
        {t('provider.card.toCollect', { amount: formatKobo(booking.balance_due_kobo) })}
      </p>
    );
  }
  return null;
};

const ProviderBookingCard = ({ booking }: { booking: ProviderBooking }) => {
  const { t } = useTranslation();

  return (
    <Card className="p-4 transition-colors hover:border-line-strong">
      <Link
        to={providerBookingPath(booking.provider.id, booking.id)}
        className="group flex flex-col gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <StatusBadge status={booking.status} viewer="provider" />
          <span className="text-copy-muted font-semibold text-label tracking-wider tabular-nums">
            {booking.code}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <p className="text-ink text-body font-bold">
              {t('provider.card.produce', {
                produce: booking.crop.name,
                amount: formatAmount(booking.quantity, booking.capacity_unit, t),
              })}
            </p>
            <p className="text-copy-muted text-label">
              {t('provider.card.dates', {
                start: formatDate(booking.start_date),
                end: formatDate(booking.end_date),
              })}
            </p>
          </div>
          <ChevronRight
            size={20}
            className="text-copy-subtle shrink-0 mt-0.5 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
        <NextStep booking={booking} />
      </Link>
    </Card>
  );
};

export default ProviderBookingCard;
