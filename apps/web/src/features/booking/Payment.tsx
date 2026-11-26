import React, { type ReactNode } from 'react';
import { TimerOff } from 'lucide-react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateBookingBody } from '@coldlink/shared';
import { bookingKey, bookingQuery, createBooking, initializePayment } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { cropsQuery } from '../../api/referenceData';
import TopNavBar from '../../components/TopNavBar';
import BottomNav from '../../components/BottomNav';
import ErrorMessage from '../../components/ui/ErrorMessage';
import Notice from '../../components/ui/Notice';
import PageHeader from '../../components/ui/PageHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatKobo, formatLagosTime } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import {
  BookingProgress,
  BrokenBookingLink,
  FacilityGone,
  LoadFailed,
  ProblemScreen,
  QuoteProblemNotice,
} from './BookingStates';
import { bookingStepPath, readBookingRoute, type BookingRoute } from './bookingIntent';
import { BookingSummary, PayNowNotice, type BookingTerms } from './BookingSummary';
import { confirmationPath, heldBookingPath, holdIsRunning, readHeldBookingId } from './paymentFlow';
import { readBookingProblem, useBooking } from './useBooking';
import {
  isStepError,
  PaymentStepError,
  runStep,
  usePaymentAttempt,
  type PaymentStep,
} from './usePaymentAttempt';

type PayFrom =
  | { kind: 'new'; body: CreateBookingBody; quotedTotalKobo: number }
  | { kind: 'held'; bookingId: string };

interface HeldBookingState {
  priceChanged?: boolean;
}

type Attempt = ReturnType<typeof usePaymentAttempt<PayFrom>>;

const causeIn = (error: unknown, step: PaymentStep) =>
  isStepError(error, step) ? error.cause : undefined;

const PaymentScreen = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <TopNavBar title={t('booking.payment.navTitle')} showBack={true} />
      <BookingProgress step="pay" />
      <PageHeader title={t('booking.payment.title')} intro={t('booking.payment.intro')} />

      <div className="flex flex-col gap-4 px-5 pt-5 pb-6">{children}</div>

      <BottomNav activeTab="find" />
    </div>
  );
};

const PaymentSkeleton = () => {
  const { t } = useTranslation();

  return (
    <PaymentScreen>
      <p role="status" className="text-copy-muted text-label font-medium">
        {t('booking.loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-64 rounded-xl bg-surface-muted" />
        <div className="h-28 rounded-xl bg-surface-sunken" />
      </div>
    </PaymentScreen>
  );
};

interface PayButtonProps {
  terms: BookingTerms;
  attempt: Attempt;
  onPay: () => void;
}

/** The one action: pay the exact amount shown, or, after a failed try, say why and try again. */
const PayButton = ({ terms, attempt, onPay }: PayButtonProps) => {
  const { t } = useTranslation();
  const failure = attempt.error instanceof PaymentStepError ? attempt.error.cause : attempt.error;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {attempt.redirecting && (
        <p role="status" className="text-copy-muted text-body">
          {t('booking.payment.openingNote')}
        </p>
      )}
      {failure !== null && <ErrorMessage>{describeApiError(failure, t)}</ErrorMessage>}
      <PrimaryButton onClick={onPay} disabled={attempt.redirecting}>
        {attempt.redirecting
          ? t('booking.payment.opening')
          : isApiError(failure, 'network')
            ? t('common.tryAgain')
            : t('booking.payAmount', { amount: formatKobo(terms.total_charged_online_kobo) })}
      </PrimaryButton>
    </div>
  );
};

const PriceChangedNotice = () => {
  const { t } = useTranslation();

  return (
    <Notice tone="error" role="alert" title={t('booking.payment.priceChangedTitle')}>
      {t('booking.payment.priceChangedBody')}
    </Notice>
  );
};

/** Back to review of the same terms, which asks for the latest space and price. */
const useStartAgain = (route: BookingRoute | undefined) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return () => {
    if (!route) return;
    // A quote cached before this one failed would show space that is gone.
    queryClient.removeQueries({ queryKey: ['quote'] });
    void navigate(bookingStepPath('review', route.providerId, route.intent), { replace: true });
  };
};

const HoldExpired = ({ route }: { route: BookingRoute }) => {
  const { t } = useTranslation();
  const startAgain = useStartAgain(route);

  return (
    <ProblemScreen
      navTitle={t('booking.payment.navTitle')}
      icon={TimerOff}
      title={t('booking.payment.holdExpiredTitle')}
      body={t('booking.payment.holdExpiredBody')}
      action={t('booking.payment.startAgain')}
      onAction={startAgain}
    />
  );
};

const PayNewBooking = ({ attempt }: { attempt: Attempt }) => {
  const booking = useBooking();
  const crops = useQuery(cropsQuery);
  const { t } = useTranslation();
  const navTitle = t('booking.payment.navTitle');
  const bookFailure = causeIn(attempt.error, 'book');

  if (booking.status === 'invalidLink') return <BrokenBookingLink />;
  if (booking.status === 'gone' || isApiError(bookFailure, 'not_found')) {
    return <FacilityGone navTitle={navTitle} />;
  }
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
  if (crops.isSuccess && booking.status === 'ready' && !crop) return <BrokenBookingLink />;
  if (booking.status !== 'ready' || !crop) return <PaymentSkeleton />;

  const { route, provider, quote } = booking;
  const problem = booking.problem ?? readBookingProblem(bookFailure);
  const asked = { quantity: route.intent.quantity, unit: route.intent.capacity_unit };

  return (
    <PaymentScreen>
      <BookingSummary facility={provider} cropName={crop.name} terms={quote} />
      {problem && <QuoteProblemNotice problem={problem} asked={asked} />}
      {quote && !problem && (
        <>
          <PayNowNotice terms={quote} facility={provider.display_name} />
          <PayButton
            terms={quote}
            attempt={attempt}
            onPay={() =>
              attempt.start({
                kind: 'new',
                body: { ...route.intent, provider_id: route.providerId },
                quotedTotalKobo: quote.total_charged_online_kobo,
              })
            }
          />
        </>
      )}
    </PaymentScreen>
  );
};

interface PayHeldBookingProps {
  route: BookingRoute;
  bookingId: string;
  attempt: Attempt;
}

const PayHeldBooking = ({ route, bookingId, attempt }: PayHeldBookingProps) => {
  const store = useSessionStore();
  const { t } = useTranslation();
  const state = useLocation().state as HeldBookingState | null;
  const held = useQuery(bookingQuery(store.authorizedRequest, bookingId));
  const navTitle = t('booking.payment.navTitle');

  if (isApiError(held.error, 'not_found')) return <BrokenBookingLink />;
  if (held.isError) {
    return (
      <LoadFailed
        navTitle={navTitle}
        error={held.error}
        retry={() => void held.refetch()}
        retrying={held.isFetching}
      />
    );
  }
  if (!held.data) return <PaymentSkeleton />;

  const booking = held.data;
  if (booking.provider.id !== route.providerId) return <BrokenBookingLink />;
  if (booking.status !== 'payment_pending' && booking.status !== 'expired') {
    return <Navigate to={confirmationPath(booking.id)} replace />;
  }
  // Judged when the booking was read; a hold that lapses after that is refused by initialize.
  if (!holdIsRunning(booking, held.dataUpdatedAt)) return <HoldExpired route={route} />;

  return (
    <PaymentScreen>
      <BookingSummary facility={booking.provider} cropName={booking.crop.name} terms={booking} />
      {state?.priceChanged && <PriceChangedNotice />}
      <PayNowNotice terms={booking} facility={booking.provider.display_name} />
      <p className="text-copy-muted text-body">
        {t('booking.payment.holdUntil', formatLagosTime(booking.payment_expires_at!))}
      </p>
      <PayButton
        terms={booking}
        attempt={attempt}
        onPay={() => attempt.start({ kind: 'held', bookingId: booking.id })}
      />
    </PaymentScreen>
  );
};

const Payment = () => {
  const { providerId } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const query = new URLSearchParams(search);
  const route = readBookingRoute(providerId, query);
  const heldId = readHeldBookingId(query);
  const startAgain = useStartAgain(route);

  // The screen stays mounted when the new booking's id goes into the URL, so the attempt that made
  // it carries on to Paystack and its errors stay on screen.
  const attempt = usePaymentAttempt(async (from: PayFrom) => {
    let bookingId = from.kind === 'held' ? from.bookingId : undefined;
    if (from.kind === 'new' && route) {
      let booking;
      try {
        booking = await createBooking(store.authorizedRequest, from.body);
      } catch (error) {
        // Someone took the space since the quote: review shows what is free now.
        if (isApiError(error, 'conflict')) {
          startAgain();
          return undefined;
        }
        throw new PaymentStepError('book', error);
      }
      queryClient.setQueryData(bookingKey(booking.id), booking);
      const priceChanged = booking.total_charged_online_kobo !== from.quotedTotalKobo;
      void navigate(heldBookingPath(route, booking.id), {
        replace: true,
        state: { priceChanged } satisfies HeldBookingState,
      });
      // The farmer only ever pays an amount they have seen.
      if (priceChanged) return undefined;
      bookingId = booking.id;
    }
    if (bookingId === undefined) return undefined;
    const charge = await runStep('pay', () =>
      initializePayment(store.authorizedRequest, bookingId),
    );
    return charge.authorization_url;
  });

  if (!route || heldId === undefined) return <BrokenBookingLink />;
  // The hold ran out before Paystack was asked (decision 92).
  if (isApiError(causeIn(attempt.error, 'pay'), 'conflict')) return <HoldExpired route={route} />;
  return heldId === null ? (
    <PayNewBooking attempt={attempt} />
  ) : (
    <PayHeldBooking route={route} bookingId={heldId} attempt={attempt} />
  );
};

export default Payment;
