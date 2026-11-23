import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  providerBookingGroups,
  providerBookingGroupSchema,
  type ProviderBookingGroup,
} from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { providerBookingsQuery } from '../../api/providerBookings';
import TopNavBar from '../../components/TopNavBar';
import ErrorMessage from '../../components/ui/ErrorMessage';
import TextButton from '../../components/ui/TextButton';
import { useSessionStore } from '../../session/sessionContext';
import { providerBookingsPath } from '../../session/routes';
import { LoadFailed } from '../booking/BookingStates';
import ProviderBookingCard from './ProviderBookingCard';
import { FacilityNotFound, ListSkeleton } from './ProviderStates';
import { useProviderParams } from './useProviderParams';

// Links rather than ARIA tabs: each group is its own address, so back returns to it.
const GroupLinks = ({
  providerId,
  active,
}: {
  providerId: string;
  active: ProviderBookingGroup;
}) => {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('provider.bookings.groupsLabel')} className="mb-6">
      <ul className="grid grid-cols-4 gap-1 rounded-xl bg-surface-muted p-1">
        {providerBookingGroups.map((group) => (
          <li key={group}>
            <Link
              to={providerBookingsPath(providerId, group)}
              replace
              aria-current={group === active ? 'page' : undefined}
              className={`flex items-center justify-center text-center min-h-12 px-1 rounded-lg text-label font-semibold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-primary-strong ${
                group === active
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-copy-muted hover:text-ink'
              }`}
            >
              {t(`provider.groups.${group}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

const GroupList = ({ providerId, group }: { providerId: string; group: ProviderBookingGroup }) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const query = useInfiniteQuery(providerBookingsQuery(store.authorizedRequest, providerId, group));

  if (isApiError(query.error, 'not_found')) {
    return <FacilityNotFound navTitle={t('provider.bookings.navTitle')} />;
  }
  if (query.isError && query.data === undefined) {
    return (
      <LoadFailed
        navTitle={t('provider.bookings.navTitle')}
        title={t('provider.bookings.failedTitle')}
        error={query.error}
        retry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const bookings = query.data?.pages.flatMap((page) => page.data);

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-10">
      <TopNavBar title={t('provider.bookings.navTitle')} showBack={true} />
      <div className="flex flex-col px-5 pt-6">
        <h1 className="font-heading text-headline font-bold text-ink mb-6">
          {t('provider.bookings.title')}
        </h1>
        <GroupLinks providerId={providerId} active={group} />
        {bookings === undefined ? (
          <ListSkeleton label={t('provider.bookings.loading')} />
        ) : bookings.length === 0 ? (
          <p className="text-copy-muted text-lead text-center pt-6">
            {t(`provider.empty.${group}`)}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <ProviderBookingCard booking={booking} />
                </li>
              ))}
            </ul>
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
          </>
        )}
      </div>
    </div>
  );
};

/** The facility's bookings, one group at a time: to answer, coming in, in storage and past. */
const ProviderBookings = () => {
  const { t } = useTranslation();
  const { providerId } = useProviderParams();
  const [searchParams] = useSearchParams();
  const group = providerBookingGroupSchema.catch('requests').parse(searchParams.get('group'));

  if (providerId === undefined) {
    return <FacilityNotFound navTitle={t('provider.bookings.navTitle')} />;
  }
  return <GroupList key={group} providerId={providerId} group={group} />;
};

export default ProviderBookings;
