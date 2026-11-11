import React from 'react';
import { MapPin, Snowflake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { BookingQuote, Crop, PublicProvider } from '@coldlink/shared';
import { cropsQuery } from '../../api/referenceData';
import TopNavBar from '../../components/TopNavBar';
import BottomNav from '../../components/BottomNav';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import { formatDate, formatKobo } from '../../i18n/format';
import { formatAmount } from '../search/units';
import {
  BookingProgress,
  BrokenBookingLink,
  FacilityGone,
  LoadFailed,
  QuoteProblemNotice,
} from './BookingStates';
import { bookingStepPath } from './bookingIntent';
import { useBooking, useChangeAmountPath } from './useBooking';

interface BookingSummaryProps {
  provider: PublicProvider;
  crop: Crop;
  quote: BookingQuote | undefined;
}

const BookingSummary = ({ provider, crop, quote }: BookingSummaryProps) => {
  const { t } = useTranslation();

  return (
    <Card tone="muted" className="p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-ink shrink-0">
          <Snowflake size={20} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-ink text-lead">{provider.display_name}</h2>
          <div className="flex items-start text-copy-subtle text-label mt-0.5">
            <MapPin size={12} className="mr-1 mt-1 shrink-0" aria-hidden="true" />
            {provider.address_text}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-line flex flex-col gap-3">
        <SummaryRow label={t('booking.review.produce')} value={crop.name} />
        {quote && (
          <>
            <SummaryRow
              label={t('booking.review.quantity')}
              value={formatAmount(quote.quantity, quote.capacity_unit, t)}
            />
            <SummaryRow label={t('booking.review.dropOff')} value={formatDate(quote.start_date)} />
            <SummaryRow label={t('booking.review.collect')} value={formatDate(quote.end_date)} />
            <SummaryRow
              label={t('booking.review.duration')}
              value={t('booking.review.durationValue', { count: quote.duration_days })}
            />
          </>
        )}
      </div>
    </Card>
  );
};

// Every figure is the quote's, as the API worked it out; the screen adds nothing up (PRD 7.4).
const PriceBreakdown = ({ quote, facility }: { quote: BookingQuote; facility: string }) => {
  const { t } = useTranslation();

  return (
    <>
      <Card tone="muted" className="p-5">
        <CardTitle>{t('booking.review.priceTitle')}</CardTitle>
        <div className="flex flex-col gap-3">
          <SummaryRow
            label={t('booking.review.storage', { count: quote.duration_days })}
            value={formatKobo(quote.storage_subtotal_kobo)}
          />
          <div className="h-[1px] bg-line-strong w-full"></div>
          <SummaryRow
            label={t('booking.review.deposit')}
            value={formatKobo(quote.deposit_kobo)}
            variant="highlight"
          />
          <SummaryRow
            label={t('booking.review.serviceFee')}
            value={formatKobo(quote.service_fee_kobo)}
            variant="highlight"
          />
          {quote.delivery_fee_kobo > 0 && (
            <SummaryRow
              label={t('booking.review.delivery')}
              value={formatKobo(quote.delivery_fee_kobo)}
              variant="highlight"
            />
          )}
          <SummaryRow
            label={t('booking.review.balance')}
            value={formatKobo(quote.balance_due_kobo)}
          />
        </div>
      </Card>

      <div className="bg-accent rounded-2xl p-5">
        <p className="font-heading font-bold text-headline text-accent-ink mb-2 leading-tight">
          {t('booking.review.payNow', { amount: formatKobo(quote.total_charged_online_kobo) })}
        </p>
        <p className="text-accent-ink text-body leading-relaxed">
          {t('booking.review.payNowBody', {
            balance: formatKobo(quote.balance_due_kobo),
            facility,
          })}
        </p>
      </div>
    </>
  );
};

const ReviewSkeleton = () => {
  const { t } = useTranslation();

  return (
    <>
      <p role="status" className="text-copy-muted text-body">
        {t('booking.loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-64 rounded-2xl bg-surface-muted" />
        <div className="h-52 rounded-2xl bg-surface-muted" />
        <div className="h-28 rounded-2xl bg-surface-sunken" />
      </div>
    </>
  );
};

const Review = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const booking = useBooking();
  const crops = useQuery(cropsQuery);
  const changeAmountPath = useChangeAmountPath();
  const navTitle = t('booking.review.navTitle');

  if (booking.status === 'invalidLink') return <BrokenBookingLink />;
  if (booking.status === 'gone') return <FacilityGone navTitle={navTitle} />;
  if (booking.status === 'failed') return <LoadFailed navTitle={navTitle} {...booking} />;
  if (crops.isError) {
    return (
      <LoadFailed
        navTitle={navTitle}
        error={crops.error}
        retry={() => void crops.refetch()}
        retrying={crops.isFetching}
      />
    );
  }
  const crop =
    booking.status === 'ready'
      ? crops.data?.data.find(({ id }) => id === booking.route.intent.crop_id)
      : undefined;
  // The crop id is only ever checked here: the quote does not take it.
  if (crops.isSuccess && booking.status === 'ready' && !crop) return <BrokenBookingLink />;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      <TopNavBar title={navTitle} showBack={true} />
      <BookingProgress step="review" />

      <div className="flex flex-col gap-4 px-5 pt-6 pb-6 flex-grow">
        <div className="mb-2">
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-2 tracking-tight">
            {t('booking.review.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">{t('booking.review.intro')}</p>
        </div>

        {booking.status === 'ready' && crop ? (
          <>
            <BookingSummary provider={booking.provider} crop={crop} quote={booking.quote} />
            {booking.problem && (
              <QuoteProblemNotice
                problem={booking.problem}
                asked={{
                  quantity: booking.route.intent.quantity,
                  unit: booking.route.intent.capacity_unit,
                }}
              />
            )}
            {booking.quote && (
              <PriceBreakdown quote={booking.quote} facility={booking.provider.display_name} />
            )}

            <div className="flex flex-col gap-2 mt-4">
              {booking.quote ? (
                <>
                  <PrimaryButton
                    onClick={() =>
                      void navigate(
                        bookingStepPath('payment', booking.route.providerId, booking.route.intent),
                      )
                    }
                    withArrow
                  >
                    {t('booking.payAmount', {
                      amount: formatKobo(booking.quote.total_charged_online_kobo),
                    })}
                  </PrimaryButton>
                  <TextButton onClick={() => void navigate(changeAmountPath)}>
                    {t('booking.changeAmount')}
                  </TextButton>
                </>
              ) : (
                <PrimaryButton onClick={() => void navigate(changeAmountPath)}>
                  {t('booking.changeAmount')}
                </PrimaryButton>
              )}
            </div>
          </>
        ) : (
          <ReviewSkeleton />
        )}
      </div>

      <BottomNav activeTab="find" />
    </div>
  );
};

export default Review;
