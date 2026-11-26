import React, { useState } from 'react';
import { CalendarDays, Leaf, SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { ProviderBookingDetail as Booking } from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { providerBookingQuery } from '../../api/providerBookings';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import Notice from '../../components/ui/Notice';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import { formatDate, formatKobo, formatLagosTime } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import { providerBookingsPath } from '../../session/routes';
import { DetailRow } from '../booking/BookingFacts';
import { LoadFailed, ProblemScreen } from '../booking/BookingStates';
import StatusBadge from '../booking/StatusBadge';
import StatusHistory from '../booking/StatusHistory';
import { formatAmount } from '../search/units';
import BookingActions, { type ActionOutcome } from './BookingActions';
import { FacilityNotFound, ListSkeleton } from './ProviderStates';
import { useProviderParams } from './useProviderParams';

const FactsCard = ({ booking }: { booking: Booking }) => {
  const { t } = useTranslation();

  return (
    <Card className="p-5 mb-4">
      <div className="flex flex-col gap-4">
        <DetailRow icon={Leaf} label={t('provider.booking.produce')}>
          <p className="text-ink text-body">
            {t('provider.card.produce', {
              produce: booking.crop.name,
              amount: formatAmount(booking.quantity, booking.capacity_unit, t),
            })}
          </p>
        </DetailRow>
        <DetailRow icon={CalendarDays} label={t('provider.booking.dates')}>
          <p className="text-ink text-body">
            {t('provider.booking.datesValue', {
              start: formatDate(booking.start_date),
              end: formatDate(booking.end_date),
              count: booking.duration_days,
            })}
          </p>
        </DetailRow>
      </div>
    </Card>
  );
};

// The API's figures, from the booking's snapshot; the screen adds nothing up (PRD 9.4).
const MoneyCard = ({ booking }: { booking: Booking }) => {
  const { t } = useTranslation();

  return (
    <Card className="p-5 mb-4">
      <CardTitle>{t('provider.booking.moneyTitle')}</CardTitle>
      <div className="flex flex-col gap-3">
        <SummaryRow
          label={t('provider.booking.payout')}
          value={formatKobo(booking.payout_kobo)}
          variant="highlight"
        />
        <SummaryRow
          label={t('provider.booking.balance')}
          value={formatKobo(booking.balance_due_kobo)}
        />
      </div>
      <p className="text-copy-muted text-label mt-4">{t('provider.booking.payoutHint')}</p>
    </Card>
  );
};

const TimesCard = ({ booking }: { booking: Booking }) => {
  const { t } = useTranslation();
  const at = (iso: string) => t('booking.detail.at', formatLagosTime(iso));
  const rows = [
    booking.status === 'pending_provider' && booking.provider_response_due_at
      ? { label: t('provider.booking.answerByLabel'), value: at(booking.provider_response_due_at) }
      : undefined,
    booking.checked_in_at
      ? { label: t('provider.booking.checkedIn'), value: at(booking.checked_in_at) }
      : undefined,
    booking.collected_at
      ? { label: t('provider.booking.collected'), value: at(booking.collected_at) }
      : undefined,
  ].filter((row) => row !== undefined);
  if (rows.length === 0) return null;

  return (
    <Card className="p-5 mb-4">
      <CardTitle>{t('provider.booking.timesTitle')}</CardTitle>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <SummaryRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </Card>
  );
};

const OutcomeNotice = ({ outcome }: { outcome: ActionOutcome }) => {
  const { t } = useTranslation();

  if (outcome.result === 'done') {
    return (
      <div className="mb-4">
        <Notice tone="done">{t(`provider.booking.done.${outcome.action}`)}</Notice>
      </div>
    );
  }
  return (
    <div className="mb-4">
      <Notice tone="error" role="alert">
        {outcome.result.conflict}
      </Notice>
    </div>
  );
};

const BookingNotFound = ({ providerId }: { providerId: string }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={t('provider.booking.navTitle')}
      icon={SearchX}
      title={t('provider.booking.notFoundTitle')}
      body={t('provider.booking.notFoundBody')}
      action={t('provider.booking.backToBookings')}
      onAction={() => void navigate(providerBookingsPath(providerId), { replace: true })}
    />
  );
};

/** One booking for the facility: its facts and money, history, and the action its status allows. */
const ProviderBookingDetail = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const { providerId, bookingId } = useProviderParams();
  const query = useQuery({
    ...providerBookingQuery(store.authorizedRequest, providerId ?? '', bookingId ?? ''),
    enabled: providerId !== undefined && bookingId !== undefined,
  });
  const [outcome, setOutcome] = useState<ActionOutcome>();
  const navTitle = t('provider.booking.navTitle');

  if (providerId === undefined) return <FacilityNotFound navTitle={navTitle} />;
  if (bookingId === undefined) return <BookingNotFound providerId={providerId} />;
  // The API answers an unknown or someone else's facility and booking alike; this screen too.
  if (isApiError(query.error, 'not_found')) return <BookingNotFound providerId={providerId} />;
  if (query.isError && query.data === undefined) {
    return (
      <LoadFailed
        navTitle={navTitle}
        title={t('provider.booking.failedTitle')}
        error={query.error}
        retry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const booking = query.data;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      <TopNavBar title={navTitle} showBack={true} />
      {booking ? (
        <>
          <div className="flex flex-col items-start gap-2 px-5 pt-6 pb-5 rim">
            <StatusBadge status={booking.status} viewer="provider" />
            <h1 className="text-headline-lg font-bold text-ink tracking-tight break-words mt-1">
              {t('provider.card.produce', {
                produce: booking.crop.name,
                amount: formatAmount(booking.quantity, booking.capacity_unit, t),
              })}
            </h1>
            <p className="flex flex-wrap gap-x-2 text-copy-muted text-label font-medium">
              <span>{t('provider.booking.codeLabel')}</span>
              <span className="whitespace-nowrap text-ink font-semibold tracking-wider tabular-nums">
                {booking.code}
              </span>
            </p>
          </div>
          <div className="flex flex-col px-5 pt-5">
            {outcome && <OutcomeNotice outcome={outcome} />}
            <BookingActions key={booking.status} booking={booking} onOutcome={setOutcome} />
            <FactsCard booking={booking} />
            <MoneyCard booking={booking} />
            <TimesCard booking={booking} />
            <StatusHistory history={booking.status_history} viewer="provider" />
          </div>
        </>
      ) : (
        <div className="px-5 pt-6">
          <ListSkeleton label={t('common.loading')} rows={3} />
        </div>
      )}
    </div>
  );
};

export default ProviderBookingDetail;
