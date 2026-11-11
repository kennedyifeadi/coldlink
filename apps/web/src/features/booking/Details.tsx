import React from 'react';
import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { BookingQuote, PublicProvider, SearchResponse } from '@coldlink/shared';
import { searchQueryKey } from '../../api/search';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatKobo, formatNumber } from '../../i18n/format';
import { facilityTypeIcons } from '../search/facilityTypeIcons';
import { Rating } from '../search/ResultCard';
import { readDraft, useSearchFlow } from '../search/searchFlow';
import { formatAmount } from '../search/units';
import {
  BookingProgress,
  BrokenBookingLink,
  FacilityGone,
  LoadFailed,
  QuoteProblemNotice,
} from './BookingStates';
import { bookingStepPath } from './bookingIntent';
import { useBooking, useChangeAmountPath, type ReadyBooking } from './useBooking';

// Photos are drawn at most this wide; the box keeps their 4:3 shape before they load.
const PHOTO_WIDTH = 400;
const PHOTO_HEIGHT = 300;

/**
 * The distance search worked out, while its results are still cached. The search point is never
 * in the URL (decision 78), so after a reload there is no distance to show.
 */
const useSearchedDistance = (providerId: string) => {
  const queryClient = useQueryClient();
  const draft = readDraft(useSearchFlow().draft);
  if (!('body' in draft)) return undefined;
  const results = queryClient.getQueryData<SearchResponse>(searchQueryKey(draft.body));
  return results?.data.find((result) => result.provider.id === providerId)?.distance_km;
};

const Photos = ({ provider }: { provider: PublicProvider }) => {
  const { t } = useTranslation();
  const TypeIcon = facilityTypeIcons[provider.facility_type];

  if (provider.photos.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="w-full h-40 rounded-2xl bg-primary-soft text-primary-strong flex items-center justify-center"
      >
        <TypeIcon size={56} strokeWidth={1.5} />
      </div>
    );
  }
  const single = provider.photos.length === 1;
  return (
    <ul className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1">
      {provider.photos.map((photo, index) => (
        <li
          key={photo.id}
          className={`snap-start shrink-0 aspect-[4/3] rounded-2xl overflow-hidden bg-surface-muted ${single ? 'w-full' : 'w-[85%]'}`}
        >
          <img
            src={photo.url}
            alt={t('booking.details.photo', { number: index + 1, name: provider.display_name })}
            width={PHOTO_WIDTH}
            height={PHOTO_HEIGHT}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </li>
      ))}
    </ul>
  );
};

const temperatureText = (provider: PublicProvider, t: TFunction) => {
  const { temp_min_c: min, temp_max_c: max } = provider;
  if (min !== null && max !== null) {
    return t('booking.details.temperatureRange', {
      min: formatNumber(min),
      max: formatNumber(max),
    });
  }
  if (min !== null) return t('booking.details.temperatureFrom', { min: formatNumber(min) });
  if (max !== null) return t('booking.details.temperatureUpTo', { max: formatNumber(max) });
  return undefined;
};

const FacilityCard = ({ provider }: { provider: PublicProvider }) => {
  const { t } = useTranslation();
  const temperature = temperatureText(provider, t);
  const backup = provider.has_backup_power === 'unknown' ? undefined : provider.has_backup_power;
  if (temperature === undefined && backup === undefined) return null;

  return (
    <Card className="p-5">
      <CardTitle>{t('booking.details.facilityTitle')}</CardTitle>
      <div className="flex flex-col gap-3">
        {temperature && <SummaryRow label={t('booking.details.temperature')} value={temperature} />}
        {backup && (
          <SummaryRow
            label={t('booking.details.backupPower')}
            value={t(`booking.details.backup.${backup}`)}
          />
        )}
      </div>
    </Card>
  );
};

const SpaceCard = ({ provider, quote, problem }: Omit<ReadyBooking, 'status' | 'route'>) => {
  const { t } = useTranslation();
  const unit = provider.capacity_unit;
  const available =
    quote?.available_quantity ??
    (problem?.kind === 'notEnoughSpace' ? problem.available : undefined);

  return (
    <Card className="p-5">
      <CardTitle>{t('booking.details.spaceTitle')}</CardTitle>
      <div className="flex flex-col gap-3">
        <SummaryRow
          label={t('booking.details.price')}
          value={t(`booking.details.pricePer.${unit}`, {
            price: formatKobo(unitPrice(provider, quote)),
          })}
        />
        {available !== undefined && (
          <SummaryRow label={t('booking.details.free')} value={formatAmount(available, unit, t)} />
        )}
        {provider.min_storage_days > 1 && (
          <SummaryRow
            label={t('booking.details.minDays')}
            value={t('booking.details.minDaysValue', { count: provider.min_storage_days })}
          />
        )}
      </div>
    </Card>
  );
};

// The quote's price is the one the booking would be made at; the facility's is shown when the
// quote was refused.
const unitPrice = (provider: PublicProvider, quote: BookingQuote | undefined) =>
  quote?.unit_price_kobo ?? provider.price_per_unit_per_day_kobo;

const DetailsSkeleton = () => {
  const { t } = useTranslation();

  return (
    <>
      <p role="status" className="text-copy-muted text-body">
        {t('booking.loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="w-full h-40 rounded-2xl bg-surface-sunken" />
        <div className="flex flex-col gap-2">
          <div className="h-8 w-3/4 rounded bg-surface-sunken" />
          <div className="h-5 w-1/3 rounded bg-surface-muted" />
          <div className="h-5 w-2/3 rounded bg-surface-muted" />
        </div>
        <div className="h-36 rounded-2xl bg-surface-muted" />
        <div className="h-24 rounded-2xl bg-surface-muted" />
      </div>
    </>
  );
};

const Facility = ({ route, provider, quote, problem }: ReadyBooking) => {
  const { t } = useTranslation();
  const distance = useSearchedDistance(provider.id);
  const TypeIcon = facilityTypeIcons[provider.facility_type];

  return (
    <>
      <Photos provider={provider} />

      <div>
        <h1 className="font-heading text-headline font-bold text-ink leading-tight mb-2">
          {provider.display_name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
          <span className="flex items-center gap-1.5 text-copy-muted text-label">
            <TypeIcon size={16} aria-hidden="true" />
            {t(`search.facilityTypes.${provider.facility_type}`)}
          </span>
          <Rating average={provider.avg_rating} count={provider.rating_count} />
        </div>
        <div className="flex items-start gap-1.5 text-copy text-body">
          <MapPin size={16} className="shrink-0 mt-0.5 text-copy-muted" aria-hidden="true" />
          <div>
            <p>{provider.address_text}</p>
            {provider.landmark && (
              <p className="text-copy-muted">
                {t('booking.details.near', { landmark: provider.landmark })}
              </p>
            )}
            {distance !== undefined && (
              <p className="text-copy-muted">
                {t('booking.details.distance', { distance: formatNumber(distance) })}
              </p>
            )}
          </div>
        </div>
      </div>

      {problem && (
        <QuoteProblemNotice
          problem={problem}
          asked={{ quantity: route.intent.quantity, unit: route.intent.capacity_unit }}
        />
      )}

      <SpaceCard provider={provider} quote={quote} problem={problem} />
      <FacilityCard provider={provider} />

      {provider.description && (
        <p className="text-copy text-body leading-relaxed">{provider.description}</p>
      )}

      {provider.categories.length > 0 && (
        <div>
          <h2 className="font-heading font-semibold text-ink text-subtitle mb-3">
            {t('booking.details.storesTitle')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {provider.categories.map((category) => (
              <li
                key={category.id}
                className="bg-primary-soft text-ink px-3 py-1 rounded-full text-label font-medium"
              >
                {category.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

const Details = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const booking = useBooking();
  const changeAmountPath = useChangeAmountPath();
  const navTitle = t('booking.details.navTitle');

  if (booking.status === 'invalidLink') return <BrokenBookingLink />;
  if (booking.status === 'gone') return <FacilityGone navTitle={navTitle} />;
  if (booking.status === 'failed') return <LoadFailed navTitle={navTitle} {...booking} />;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      <TopNavBar title={navTitle} showBack={true} />
      <BookingProgress step="details" />

      <div className="flex flex-col gap-6 px-4 pt-6 pb-6 flex-grow">
        {booking.status === 'loading' ? <DetailsSkeleton /> : <Facility {...booking} />}
      </div>

      {booking.status === 'ready' && (
        <BottomActionBar>
          {booking.problem ? (
            <PrimaryButton onClick={() => void navigate(changeAmountPath)}>
              {t('booking.changeAmount')}
            </PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={() =>
                void navigate(
                  bookingStepPath('review', booking.route.providerId, booking.route.intent),
                )
              }
              withArrow
            >
              {t('booking.details.continue')}
            </PrimaryButton>
          )}
        </BottomActionBar>
      )}
    </div>
  );
};

export default Details;
