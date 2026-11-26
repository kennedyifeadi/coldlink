import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { cropsQuery } from '../../api/referenceData';
import TopNavBar from '../../components/TopNavBar';
import BottomNav from '../../components/BottomNav';
import PageHeader from '../../components/ui/PageHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import { formatKobo } from '../../i18n/format';
import {
  BookingProgress,
  BrokenBookingLink,
  FacilityGone,
  LoadFailed,
  QuoteProblemNotice,
} from './BookingStates';
import { bookingStepPath } from './bookingIntent';
import { BookingSummary, PriceBreakdown } from './BookingSummary';
import { useBooking, useChangeAmountPath } from './useBooking';

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
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <TopNavBar title={navTitle} showBack={true} />
      <BookingProgress step="review" />
      <PageHeader title={t('booking.review.title')} intro={t('booking.review.intro')} />

      <div className="flex flex-col gap-4 px-5 pt-5 pb-6">
        {booking.status === 'ready' && crop ? (
          <>
            <BookingSummary
              facility={booking.provider}
              cropName={crop.name}
              terms={booking.quote}
            />
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
              <PriceBreakdown terms={booking.quote} facility={booking.provider.display_name} />
            )}

            <div className="flex flex-col gap-3 mt-2">
              {booking.quote ? (
                <>
                  <PrimaryButton
                    onClick={() =>
                      void navigate(
                        bookingStepPath('payment', booking.route.providerId, booking.route.intent),
                      )
                    }
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
