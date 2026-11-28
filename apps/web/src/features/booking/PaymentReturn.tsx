import React from 'react';
import { CircleAlert, RotateCcw, SearchX, TimerOff, WalletCards } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { FarmerBooking, FarmerDelivery } from '@coldlink/shared';
import { bookingQuery, initializePayment, verifyPayment } from '../../api/bookings';
import { deliveryQuery, initializeDeliveryPayment } from '../../api/deliveries';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { formatKobo, formatLagosTime } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import { bookingDetailPath, MY_BOOKINGS_PATH } from '../../session/routes';
import { SEARCH_STEPS } from '../search/searchFlow';
import { LoadFailed, ProblemScreen } from './BookingStates';
import {
  confirmationPath,
  readDeliveryReturnOutcome,
  readPaymentReference,
  readReturnOutcome,
  type DeliveryPaidState,
} from './paymentFlow';
import { usePaymentAttempt } from './usePaymentAttempt';

const Checking = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-5">
      <p role="status" className="text-copy-muted text-body">
        {t('booking.paymentReturn.checking')}
      </p>
    </div>
  );
};

const UnknownPayment = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={t('booking.payment.navTitle')}
      icon={SearchX}
      title={t('booking.paymentReturn.unknownTitle')}
      body={t('booking.paymentReturn.unknownBody')}
      action={t('booking.paymentReturn.goToBookings')}
      onAction={() => void navigate(MY_BOOKINGS_PATH, { replace: true })}
    />
  );
};

/** The space is gone: a fresh search, since the place searched from is not kept (decision 78). */
const SpaceReleased = ({ booking, refunded }: { booking: FarmerBooking; refunded: boolean }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={t('booking.payment.navTitle')}
      icon={refunded ? WalletCards : TimerOff}
      title={
        refunded ? t('booking.paymentReturn.refundTitle') : t('booking.payment.holdExpiredTitle')
      }
      body={
        refunded
          ? t('booking.paymentReturn.refundBody', {
              amount: formatKobo(booking.total_charged_online_kobo),
            })
          : t('booking.paymentReturn.holdExpiredBody')
      }
      action={t('booking.paymentReturn.searchAgain')}
      onAction={() => void navigate(SEARCH_STEPS.place)}
    />
  );
};

interface NotFinishedProps {
  booking: FarmerBooking;
  checkAgain: () => void;
  checking: boolean;
}

const NotFinished = ({ booking, checkAgain, checking }: NotFinishedProps) => {
  const store = useSessionStore();
  const { t } = useTranslation();
  // The open charge is reused (decision 92), so paying again never charges twice.
  const attempt = usePaymentAttempt(async () => {
    const charge = await initializePayment(store.authorizedRequest, booking.id);
    return charge.authorization_url;
  });

  if (isApiError(attempt.error, 'conflict'))
    return <SpaceReleased booking={booking} refunded={false} />;
  const holdEnds = formatLagosTime(booking.payment_expires_at!);
  const failure = attempt.error === null ? undefined : describeApiError(attempt.error, t);

  return (
    <ProblemScreen
      navTitle={t('booking.payment.navTitle')}
      icon={failure ? CircleAlert : RotateCcw}
      title={t('booking.paymentReturn.notFinishedTitle')}
      body={failure ?? t('booking.paymentReturn.notFinishedBody', holdEnds)}
      action={
        attempt.redirecting
          ? t('booking.payment.opening')
          : isApiError(attempt.error, 'network')
            ? t('common.tryAgain')
            : t('booking.payAmount', { amount: formatKobo(booking.total_charged_online_kobo) })
      }
      onAction={() => attempt.start(undefined)}
      busy={attempt.redirecting || checking}
      secondary={{ label: t('booking.paymentReturn.checkAgain'), onClick: checkAgain }}
    />
  );
};

interface DeliveryNotPaidProps {
  delivery: FarmerDelivery;
  checkAgain: () => void;
  checking: boolean;
  refunded: boolean;
}

/** A delivery's own charge that has not gone through, or came too late (decision 143). */
const DeliveryNotPaid = ({ delivery, checkAgain, checking, refunded }: DeliveryNotPaidProps) => {
  const navigate = useNavigate();
  const store = useSessionStore();
  const { t } = useTranslation();
  // The open charge is reused (decision 143), so paying again never charges twice.
  const attempt = usePaymentAttempt(async () => {
    const charge = await initializeDeliveryPayment(store.authorizedRequest, delivery.id);
    return charge.authorization_url;
  });
  const navTitle = t(`booking.delivery.${delivery.direction}Title`);
  const backToBooking = {
    action: t('booking.delivery.refused.backToBooking'),
    onAction: () => void navigate(bookingDetailPath(delivery.booking_id), { replace: true }),
  };

  if (refunded) {
    return (
      <ProblemScreen
        navTitle={navTitle}
        icon={WalletCards}
        title={t('booking.paymentReturn.refundTitle')}
        body={t('booking.delivery.returnRefundBody', { amount: formatKobo(delivery.fee_kobo) })}
        {...backToBooking}
      />
    );
  }
  if (isApiError(attempt.error, 'conflict')) {
    return (
      <ProblemScreen
        navTitle={navTitle}
        icon={TimerOff}
        title={t('booking.paymentReturn.notFinishedTitle')}
        body={t('booking.delivery.refused.notPayable')}
        {...backToBooking}
      />
    );
  }
  const failure = attempt.error === null ? undefined : describeApiError(attempt.error, t);

  return (
    <ProblemScreen
      navTitle={navTitle}
      icon={failure ? CircleAlert : RotateCcw}
      title={t('booking.paymentReturn.notFinishedTitle')}
      body={failure ?? t('booking.delivery.returnNotFinishedBody')}
      action={
        attempt.redirecting
          ? t('booking.payment.opening')
          : isApiError(attempt.error, 'network')
            ? t('common.tryAgain')
            : t('booking.payAmount', { amount: formatKobo(delivery.fee_kobo) })
      }
      onAction={() => attempt.start(undefined)}
      busy={attempt.redirecting || checking}
      secondary={{ label: t('booking.paymentReturn.checkAgain'), onClick: checkAgain }}
    />
  );
};

/** Where Paystack sends the farmer back to, with the charge's reference (decision 92). */
const PaymentReturn = () => {
  const store = useSessionStore();
  const { t } = useTranslation();
  const reference = readPaymentReference(new URLSearchParams(useLocation().search));
  const verification = useQuery({
    queryKey: ['paymentVerification', reference],
    queryFn: ({ signal }) => verifyPayment(store.authorizedRequest, reference!, signal),
    enabled: reference !== undefined,
  });
  const bookingId = verification.data?.booking_id;
  // A delivery asked for after booking has its own charge (decision 143); null for a booking's.
  const deliveryId = verification.data?.delivery_request_id ?? null;
  const booking = useQuery({
    ...bookingQuery(store.authorizedRequest, bookingId ?? ''),
    enabled: bookingId !== undefined && deliveryId === null,
  });
  const delivery = useQuery({
    ...deliveryQuery(store.authorizedRequest, deliveryId ?? ''),
    enabled: deliveryId !== null,
  });
  const paidFor = deliveryId === null ? booking : delivery;

  if (reference === undefined || isApiError(verification.error, 'not_found')) {
    return <UnknownPayment />;
  }
  const failure = verification.error ?? paidFor.error;
  if (failure) {
    return (
      <LoadFailed
        navTitle={t('booking.payment.navTitle')}
        title={t('booking.paymentReturn.failedTitle')}
        error={failure}
        retry={() => void (verification.isError ? verification.refetch() : paidFor.refetch())}
        retrying={verification.isFetching || paidFor.isFetching}
      />
    );
  }
  if (!verification.data || !paidFor.data) return <Checking />;

  const checkAgain = () => {
    void verification.refetch().then(async () => {
      await paidFor.refetch();
    });
  };
  const checking = verification.isFetching || paidFor.isFetching;
  if (delivery.data) {
    const outcome = readDeliveryReturnOutcome(verification.data.payment_status, delivery.data);
    return outcome === 'paid' ? (
      <Navigate
        to={bookingDetailPath(delivery.data.booking_id)}
        replace
        state={{ deliveryPaid: true } satisfies DeliveryPaidState}
      />
    ) : (
      <DeliveryNotPaid
        delivery={delivery.data}
        checkAgain={checkAgain}
        checking={checking}
        refunded={outcome === 'lateRefund'}
      />
    );
  }
  if (!booking.data) return <Checking />;
  switch (
    readReturnOutcome(verification.data.payment_status, booking.data, booking.dataUpdatedAt)
  ) {
    case 'paid':
      return <Navigate to={confirmationPath(booking.data.id)} replace />;
    case 'lateRefund':
      return <SpaceReleased booking={booking.data} refunded />;
    case 'holdExpired':
      return <SpaceReleased booking={booking.data} refunded={false} />;
    case 'notFinished':
      return <NotFinished booking={booking.data} checkAgain={checkAgain} checking={checking} />;
  }
};

export default PaymentReturn;
