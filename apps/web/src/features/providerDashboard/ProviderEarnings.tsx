import React from 'react';
import { CalendarDays, CheckCircle2, Hourglass, Leaf } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  todayInLagos,
  type ProviderEarnings as Earnings,
  type ProviderPayout,
} from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { providerPayoutsQuery } from '../../api/providerBookings';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import ErrorMessage from '../../components/ui/ErrorMessage';
import SummaryRow from '../../components/ui/SummaryRow';
import TextButton from '../../components/ui/TextButton';
import { formatDate, formatKobo } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import { LoadFailed } from '../booking/BookingStates';
import { FacilityNotFound, ListSkeleton } from './ProviderStates';
import { useProviderParams } from './useProviderParams';

/** The calendar day in Lagos of an instant the API sent. */
const lagosDay = (instant: string) => formatDate(todayInLagos(new Date(instant)));

// Amounts are the API's sums, shown to the kobo; the screen adds nothing up.
const TotalsCard = ({ earnings }: { earnings: Earnings }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border-2 border-primary p-5 mb-8">
      <p className="text-copy-muted text-label font-medium">{t('provider.dashboard.owed')}</p>
      <p className="font-bold text-display text-ink tabular-nums break-words mt-1 mb-4">
        {formatKobo(earnings.owed_kobo)}
      </p>
      <SummaryRow label={t('provider.dashboard.paid')} value={formatKobo(earnings.paid_kobo)} />
      <p className="text-copy-muted text-label mt-4">{t('provider.dashboard.earningsHint')}</p>
    </div>
  );
};

// The status in words and an icon as well as the colour, as booking statuses are.
const PayoutStatus = ({ status }: { status: ProviderPayout['status'] }) => {
  const { t } = useTranslation();
  const Icon = status === 'paid' ? CheckCircle2 : Hourglass;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label font-semibold ${
        status === 'paid' ? 'bg-primary-soft text-ink' : 'bg-accent-faint text-accent-ink'
      }`}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {t(`provider.earnings.status.${status}`)}
    </span>
  );
};

// Led by the amount, since what is owed is what the provider comes here to see.
const PayoutCard = ({ payout }: { payout: ProviderPayout }) => {
  const { t } = useTranslation();
  const { booking } = payout;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <p className="font-bold text-title text-ink">{formatKobo(payout.amount_kobo)}</p>
        <PayoutStatus status={payout.status} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-copy-muted font-semibold text-label tracking-wider tabular-nums">
          {booking.code}
        </p>
        <p className="flex items-center gap-2 text-ink text-body font-medium">
          <Leaf size={16} className="text-copy-subtle shrink-0" aria-hidden="true" />
          {booking.crop.name}
        </p>
        <p className="flex items-center gap-2 text-copy-muted text-body">
          <CalendarDays size={16} className="text-copy-subtle shrink-0" aria-hidden="true" />
          {t('provider.card.dates', {
            start: formatDate(booking.start_date),
            end: formatDate(booking.end_date),
          })}
        </p>
        {payout.status === 'paid' && payout.paid_at !== null && payout.reference !== null ? (
          <p className="text-copy text-body border-t border-line pt-3 mt-1">
            {t('provider.earnings.paidOn', { date: lagosDay(payout.paid_at) })}
            <br />
            <span className="text-copy-muted break-all">
              {t('provider.earnings.reference', { reference: payout.reference })}
            </span>
          </p>
        ) : (
          <p className="text-copy-muted text-body border-t border-line pt-3 mt-1">
            {t('provider.earnings.owedSince', { date: lagosDay(payout.created_at) })}
          </p>
        )}
      </div>
    </Card>
  );
};

const EmptyPayouts = () => {
  const { t } = useTranslation();

  return (
    <Card tone="muted" className="p-5">
      <p className="font-semibold text-ink text-subtitle mb-1">
        {t('provider.earnings.emptyTitle')}
      </p>
      <p className="text-copy-muted text-body">{t('provider.earnings.emptyBody')}</p>
    </Card>
  );
};

/** What ColdLink owes and has paid the facility, and each payout, newest first. */
const ProviderEarnings = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const { providerId } = useProviderParams();
  const query = useInfiniteQuery({
    ...providerPayoutsQuery(store.authorizedRequest, providerId ?? ''),
    enabled: providerId !== undefined,
  });
  const navTitle = t('provider.earnings.navTitle');

  if (providerId === undefined || isApiError(query.error, 'not_found')) {
    return <FacilityNotFound navTitle={navTitle} />;
  }
  if (query.isError && query.data === undefined) {
    return (
      <LoadFailed
        navTitle={navTitle}
        title={t('provider.earnings.failedTitle')}
        error={query.error}
        retry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const pages = query.data?.pages;
  const payouts = pages?.flatMap((page) => page.data);
  // Every page carries the totals; the latest page read is the freshest.
  const earnings = pages?.at(-1)?.earnings;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      <TopNavBar title={navTitle} showBack={true} />
      <PageHeader title={t('provider.earnings.title')} />
      <div className="flex flex-col px-5 pt-6">
        {payouts === undefined || earnings === undefined ? (
          <ListSkeleton label={t('provider.earnings.loading')} />
        ) : (
          <>
            <TotalsCard earnings={earnings} />
            <section aria-labelledby="payouts-heading">
              <h2 id="payouts-heading" className="font-semibold text-ink text-title mb-3">
                {t('provider.earnings.payoutsTitle')}
              </h2>
              {payouts.length === 0 ? (
                <EmptyPayouts />
              ) : (
                <ul className="flex flex-col gap-3">
                  {payouts.map((payout) => (
                    <li key={payout.id}>
                      <PayoutCard payout={payout} />
                    </li>
                  ))}
                </ul>
              )}
              {query.isFetchNextPageError && (
                <div className="mt-4">
                  <ErrorMessage>{describeApiError(query.error, t)}</ErrorMessage>
                </div>
              )}
              {query.hasNextPage && (
                <div className="mt-4">
                  <TextButton
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage
                      ? t('provider.bookings.loadingMore')
                      : query.isFetchNextPageError
                        ? t('common.tryAgain')
                        : t('provider.bookings.showMore')}
                  </TextButton>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default ProviderEarnings;
