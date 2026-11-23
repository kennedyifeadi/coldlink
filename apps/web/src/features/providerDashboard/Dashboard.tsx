import React from 'react';
import { ChevronRight, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type {
  ProviderDashboard,
  ProviderDashboardList,
  ProviderBookingGroup,
} from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { providerDashboardQuery } from '../../api/providerBookings';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import { formatDate, formatKobo, formatNumber } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import {
  providerBookingsPath,
  providerEarningsPath,
  providerSettingsPath,
} from '../../session/routes';
import { LoadFailed } from '../booking/BookingStates';
import { formatAmount } from '../search/units';
import ProviderBookingCard from './ProviderBookingCard';
import { FacilityNotFound, ListSkeleton } from './ProviderStates';
import { useProviderParams } from './useProviderParams';

// The bar shows the share; the words carry the figures, so it never relies on the bar alone.
const OccupancyCard = ({ occupancy }: { occupancy: ProviderDashboard['occupancy'] }) => {
  const { t } = useTranslation();
  const share = occupancy.total > 0 ? Math.min(occupancy.used / occupancy.total, 1) : 0;

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-copy-muted text-label font-medium mb-2">
        {t('provider.dashboard.occupancyTitle', { date: formatDate(occupancy.date) })}
      </h2>
      <p className="font-heading font-bold text-headline text-ink mb-4">
        {t('provider.dashboard.occupancyValue', {
          used: formatNumber(occupancy.used),
          total: formatAmount(occupancy.total, occupancy.capacity_unit, t),
        })}
      </p>
      <div aria-hidden="true" className="h-3 w-full rounded-full bg-surface-sunken overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <p className="text-copy-subtle text-label mt-3">{t('provider.dashboard.occupancyHint')}</p>
    </Card>
  );
};

interface BookingSectionProps {
  providerId: string;
  group: Exclude<ProviderBookingGroup, 'past'>;
  list: ProviderDashboardList;
}

const BookingSection = ({ providerId, group, list }: BookingSectionProps) => {
  const { t } = useTranslation();
  const headingId = `dashboard-${group}`;

  return (
    <section aria-labelledby={headingId} className="mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id={headingId} className="font-heading font-semibold text-ink text-title">
          {t(`provider.groups.${group}`)}{' '}
          <span className="text-copy-muted font-sans text-lead">({formatNumber(list.count)})</span>
        </h2>
        {list.count > list.items.length && (
          <Link
            to={providerBookingsPath(providerId, group)}
            className="inline-flex items-center min-h-12 text-primary-strong font-medium text-body"
          >
            {t('provider.dashboard.seeAll', { total: formatNumber(list.count) })}
          </Link>
        )}
      </div>
      {list.items.length === 0 ? (
        <p className="text-copy-muted text-body">{t(`provider.empty.${group}`)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((booking) => (
            <li key={booking.id}>
              <ProviderBookingCard booking={booking} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// Amounts are the API's sums, shown to the kobo; the screen adds nothing up.
const EarningsCard = ({
  providerId,
  earnings,
}: {
  providerId: string;
  earnings: ProviderDashboard['earnings'];
}) => {
  const { t } = useTranslation();

  return (
    <Card className="p-6 mb-6">
      <CardTitle>{t('provider.dashboard.earningsTitle')}</CardTitle>
      <div className="flex flex-col gap-3">
        <SummaryRow
          label={t('provider.dashboard.owed')}
          value={formatKobo(earnings.owed_kobo)}
          variant="highlight"
        />
        <SummaryRow label={t('provider.dashboard.paid')} value={formatKobo(earnings.paid_kobo)} />
      </div>
      <p className="text-copy-subtle text-label mt-4">{t('provider.dashboard.earningsHint')}</p>
      <Link
        to={providerEarningsPath(providerId)}
        className="inline-flex items-center gap-1 min-h-12 mt-2 text-primary-strong font-medium text-body"
      >
        {t('provider.dashboard.earningsLink')}
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </Card>
  );
};

const DashboardBody = ({ dashboard }: { dashboard: ProviderDashboard }) => {
  const { t } = useTranslation();
  const providerId = dashboard.provider.id;

  return (
    <div className="flex flex-col px-5 pt-6">
      <h1 className="font-heading text-headline font-bold text-ink mb-2 break-words">
        {dashboard.provider.display_name}
      </h1>
      <Link
        to={providerSettingsPath(providerId)}
        className="self-start inline-flex items-center gap-2 min-h-12 mb-4 text-primary-strong font-medium text-body"
      >
        <Settings size={18} aria-hidden="true" />
        {t('provider.dashboard.settingsLink')}
      </Link>
      <OccupancyCard occupancy={dashboard.occupancy} />
      <BookingSection providerId={providerId} group="requests" list={dashboard.requests} />
      <BookingSection providerId={providerId} group="upcoming" list={dashboard.upcoming} />
      <BookingSection providerId={providerId} group="in_storage" list={dashboard.in_storage} />
      <EarningsCard providerId={providerId} earnings={dashboard.earnings} />
      <Link
        to={providerBookingsPath(providerId)}
        className="flex items-center justify-center gap-2 w-full min-h-12 py-3 rounded-lg font-medium text-lead bg-surface border border-line-strong text-ink hover:bg-surface-muted transition-colors"
      >
        {t('provider.dashboard.allBookings')}
        <ChevronRight size={20} aria-hidden="true" />
      </Link>
    </div>
  );
};

/** One facility at a glance: space today, what needs an answer, what is coming and what is owed. */
const Dashboard = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const { providerId } = useProviderParams();
  const query = useQuery({
    ...providerDashboardQuery(store.authorizedRequest, providerId ?? ''),
    enabled: providerId !== undefined,
  });
  const navTitle = t('provider.dashboard.navTitle');

  if (providerId === undefined || isApiError(query.error, 'not_found')) {
    return <FacilityNotFound navTitle={navTitle} />;
  }
  if (query.isError && query.data === undefined) {
    return (
      <LoadFailed
        navTitle={navTitle}
        title={t('provider.dashboard.failedTitle')}
        error={query.error}
        retry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-10">
      <TopNavBar title={navTitle} showBack={true} />
      {query.data ? (
        <DashboardBody dashboard={query.data} />
      ) : (
        <div className="px-5 pt-6">
          <ListSkeleton label={t('provider.dashboard.loading')} rows={3} />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
