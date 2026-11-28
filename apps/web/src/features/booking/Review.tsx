import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { bookingStepPath, readBookingRoute } from './bookingIntent';
import { BookingSummary, PriceBreakdown } from './BookingSummary';
import {
  deliveryLoadOf,
  emptyDeliveryForm,
  readDeliveryForm,
  type DeliveryFormErrors,
  type DeliveryFormValues,
} from './deliveryFields';
import PickupSection from './PickupSection';
import {
  hasPickupFlag,
  pickupDraftKey,
  usePickupDraft,
  withPickupFlag,
  type PickupDraft,
} from './pickupDraft';
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

const withoutFields = (errors: DeliveryFormErrors, changed: Partial<DeliveryFormValues>) =>
  Object.fromEntries(
    Object.entries(errors).filter(([field]) => !(field in changed)),
  ) as DeliveryFormErrors;

const Review = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { providerId } = useParams();
  const query = new URLSearchParams(useLocation().search);
  const route = readBookingRoute(providerId, query);
  const crops = useQuery(cropsQuery);
  const crop = crops.data?.data.find(({ id }) => id === route?.intent.crop_id);

  // The pickup lives in the draft as it is typed, so it survives signing in before payment.
  const pickup = usePickupDraft(route);
  const flagged = hasPickupFlag(query);
  const wanted = pickup.draft?.wanted ?? flagged;
  const unit = route?.intent.capacity_unit ?? 'crates';
  const values =
    pickup.draft?.values ??
    emptyDeliveryForm({ crop: crop?.name ?? '', quantity: route?.intent.quantity ?? 1 });
  const [errors, setErrors] = useState<DeliveryFormErrors>({});

  const booking = useBooking(wanted ? deliveryLoadOf(values, unit) : undefined);
  const changeAmountPath = useChangeAmountPath();
  const navTitle = t('booking.review.navTitle');

  const saveDraft = (changes: Partial<Omit<PickupDraft, 'key'>>) => {
    if (route) pickup.save({ key: pickupDraftKey(route), wanted, values, ...changes });
  };

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
  // The crop id is only ever checked here: the quote does not take it.
  if (crops.isSuccess && booking.status === 'ready' && !crop) return <BrokenBookingLink />;

  const quote = booking.status === 'ready' ? booking.quote : undefined;
  const refreshing = booking.status === 'ready' && booking.refreshing;
  // A total without the pickup's fee is never shown once a pickup is asked for.
  const pricePending = refreshing || (wanted && !quote?.delivery);
  const pendingNote = refreshing
    ? t('booking.delivery.checkingPrice')
    : pricePending
      ? t('booking.delivery.priceAfterPin')
      : undefined;

  const goToPayment = () => {
    if (booking.status !== 'ready' || !route) return;
    const paymentPath = bookingStepPath('payment', route.providerId, route.intent);
    if (!wanted) {
      pickup.clear();
      void navigate(paymentPath);
      return;
    }
    const result = readDeliveryForm(values, unit, quote?.delivery ?? undefined, t);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    if (pricePending) return;
    saveDraft({ details: result.details });
    void navigate(withPickupFlag(paymentPath));
  };

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
              <>
                <PickupSection
                  facility={booking.provider.display_name}
                  unit={unit}
                  wanted={wanted}
                  onChoose={(choice) => {
                    saveDraft({ wanted: choice });
                    setErrors({});
                  }}
                  values={values}
                  onChange={(changes) => {
                    saveDraft({ values: { ...values, ...changes } });
                    setErrors((current) => withoutFields(current, changes));
                  }}
                  errors={errors}
                  quote={refreshing ? undefined : booking.quote.delivery}
                  detailsLost={flagged && pickup.draft === undefined}
                />
                <PriceBreakdown
                  terms={booking.quote}
                  facility={booking.provider.display_name}
                  pending={pendingNote}
                />
              </>
            )}

            <div className="flex flex-col gap-3 mt-2">
              {booking.quote ? (
                <>
                  <PrimaryButton onClick={goToPayment} disabled={refreshing}>
                    {pricePending
                      ? refreshing
                        ? t('booking.delivery.checkingPrice')
                        : t('common.continue')
                      : t('booking.payAmount', {
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
