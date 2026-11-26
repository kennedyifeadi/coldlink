import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import {
  bookingRatingPath,
  canRateBooking,
  type CancelledBooking,
  type FarmerBooking,
} from '@coldlink/shared';
import { bookingKey, bookingQuery, cancelBooking, myBookingsKey } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import DangerButton from '../../components/ui/DangerButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import Notice from '../../components/ui/Notice';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SummaryRow from '../../components/ui/SummaryRow';
import TextButton from '../../components/ui/TextButton';
import { formatKobo, formatLagosTime } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import BookAgainButton from './BookAgainButton';
import { canBookAgain } from './bookingStatus';
import BookingCountdown from './BookingCountdown';
import { BookingCode, BookingDetails } from './BookingFacts';
import { BookingNotFound, BookingSkeleton, LoadFailed } from './BookingStates';
import { RatingSummary } from './RatingStars';
import StatusBadge from './StatusBadge';
import StatusHistory from './StatusHistory';

const lagosAt = (iso: string, t: TFunction) => t('booking.detail.at', formatLagosTime(iso));

// Every figure is the API's, as it was booked; the screen adds nothing up (PRD 9.4).
const PriceCard = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();

  return (
    <Card className="p-5 mb-4">
      <CardTitle>{t('booking.detail.priceTitle')}</CardTitle>
      <div className="flex flex-col gap-3">
        <SummaryRow
          label={t('booking.detail.unitPrice')}
          value={t(`booking.details.pricePer.${booking.capacity_unit}`, {
            price: formatKobo(booking.unit_price_kobo),
          })}
        />
        <SummaryRow
          label={t('booking.review.storage', { count: booking.duration_days })}
          value={formatKobo(booking.storage_subtotal_kobo)}
        />
        <div className="h-px bg-line w-full" />
        <SummaryRow label={t('booking.detail.deposit')} value={formatKobo(booking.deposit_kobo)} />
        <SummaryRow
          label={t('booking.detail.serviceFee')}
          value={formatKobo(booking.service_fee_kobo)}
        />
        {booking.delivery_fee_kobo > 0 && (
          <SummaryRow
            label={t('booking.detail.delivery')}
            value={formatKobo(booking.delivery_fee_kobo)}
          />
        )}
        <SummaryRow
          label={t('booking.detail.totalOnline')}
          value={formatKobo(booking.total_charged_online_kobo)}
          variant="highlight"
        />
        <SummaryRow
          label={t('booking.detail.balance')}
          value={formatKobo(booking.balance_due_kobo)}
        />
      </div>
    </Card>
  );
};

/** The deadlines and times that apply to the booking as it stands. */
const timeRows = (booking: FarmerBooking, t: TFunction) =>
  [
    booking.status === 'payment_pending' && booking.payment_expires_at
      ? { label: t('booking.detail.payBy'), value: lagosAt(booking.payment_expires_at, t) }
      : undefined,
    booking.status === 'pending_provider' && booking.provider_response_due_at
      ? { label: t('booking.detail.answerBy'), value: lagosAt(booking.provider_response_due_at, t) }
      : undefined,
    booking.checked_in_at
      ? { label: t('booking.detail.broughtIn'), value: lagosAt(booking.checked_in_at, t) }
      : undefined,
    booking.collected_at
      ? { label: t('booking.detail.collected'), value: lagosAt(booking.collected_at, t) }
      : undefined,
    booking.cancelled_by
      ? {
          label: t('booking.detail.cancelledBy'),
          value: t(`booking.detail.by.${booking.cancelled_by}`),
        }
      : undefined,
    booking.cancel_reason
      ? { label: t('booking.detail.reason'), value: booking.cancel_reason }
      : undefined,
  ].filter((row) => row !== undefined);

const TimesCard = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();
  const rows = timeRows(booking, t);
  if (rows.length === 0) return null;

  return (
    <Card className="p-5 mb-4">
      <CardTitle>{t('booking.detail.timesTitle')}</CardTitle>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <SummaryRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </Card>
  );
};

/** PRD 6.6 in words, with the refund the API worked out for cancelling now. */
const CancelPolicy = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();
  const { cancellation } = booking;
  if (!cancellation.allowed) return null;
  const facility = booking.provider.display_name;
  const policy =
    cancellation.deposit_refund_ends_at === null
      ? t('booking.detail.policyPending', { facility })
      : t(
          cancellation.refund_kobo > 0
            ? 'booking.detail.policyDeposit'
            : 'booking.detail.policyLate',
          {
            ...formatLagosTime(cancellation.deposit_refund_ends_at),
          },
        );

  return (
    <div className="flex flex-col gap-3 mb-5">
      <p className="text-copy text-body">{policy}</p>
      <p className="font-bold text-title text-ink tabular-nums">
        {t('booking.detail.refundNow', { amount: formatKobo(cancellation.refund_kobo) })}
      </p>
    </div>
  );
};

const CancelledNotice = ({ result }: { result: CancelledBooking }) => {
  const { t } = useTranslation();

  return (
    <div className="mb-4">
      <Notice tone="done" title={t('booking.detail.cancelledTitle')}>
        {result.refund_kobo > 0
          ? t('booking.detail.refunded', { amount: formatKobo(result.refund_kobo) })
          : t('booking.detail.noRefund')}
      </Notice>
    </div>
  );
};

interface CancelSectionProps {
  booking: FarmerBooking;
  refresh: () => Promise<unknown>;
  onCancelled: (result: CancelledBooking) => void;
}

const CancelSection = ({ booking, refresh, onCancelled }: CancelSectionProps) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelBooking(store.authorizedRequest, booking.id),
    onSuccess: onCancelled,
    onError: (error) => {
      setConfirming(false);
      if (isApiError(error, 'conflict')) void refresh();
    },
  });

  // The preview was worked out when the booking was read; read it again before asking.
  const askToConfirm = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
    setConfirming(true);
  };

  const conflict = isApiError(cancel.error, 'conflict');
  if (!booking.cancellation.allowed) {
    return conflict ? (
      <div className="mb-4">
        <ErrorMessage>{t('booking.detail.notCancellable')}</ErrorMessage>
      </div>
    ) : null;
  }

  return (
    <Card className="p-5 mb-4">
      <h2 className="font-semibold text-ink text-subtitle mb-3">
        {t('booking.detail.cancelTitle')}
      </h2>
      {confirming ? (
        <>
          <CancelPolicy booking={booking} />
          <div className="flex flex-col gap-3">
            <DangerButton onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending
                ? t('booking.detail.cancelling')
                : t('booking.detail.confirmCancel')}
            </DangerButton>
            <TextButton onClick={() => setConfirming(false)} disabled={cancel.isPending}>
              {t('booking.detail.keep')}
            </TextButton>
          </div>
        </>
      ) : (
        <>
          {cancel.isError && !conflict && (
            <div className="mb-3">
              <ErrorMessage>{describeApiError(cancel.error, t)}</ErrorMessage>
            </div>
          )}
          <TextButton onClick={() => void askToConfirm()} disabled={checking}>
            {t('booking.detail.cancel')}
          </TextButton>
        </>
      )}
    </Card>
  );
};

const RATING_HEADING_ID = 'your-rating-title';

/** A completed booking's rating, or the way to give one (PRD 7.8). */
const RatingCard = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (booking.rating !== null) {
    return (
      <Card className="p-5 mb-4" labelledBy={RATING_HEADING_ID}>
        <CardTitle id={RATING_HEADING_ID}>{t('booking.rating.yourRating')}</CardTitle>
        <RatingSummary rating={booking.rating} />
      </Card>
    );
  }
  if (!canRateBooking(booking)) return null;
  return (
    <Card className="p-5 mb-4">
      <h2 className="font-semibold text-ink text-subtitle mb-1">{t('booking.rating.askTitle')}</h2>
      <p className="text-copy-muted text-body mb-4">
        {t('booking.rating.askBody', { facility: booking.provider.display_name })}
      </p>
      <PrimaryButton onClick={() => void navigate(bookingRatingPath(booking.id))}>
        {t('booking.rating.rateStay')}
      </PrimaryButton>
    </Card>
  );
};

/** One booking in full: every fact and amount, its rating, history, cancel and Book again. */
const BookingDetail = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const bookingId = z.uuid().safeParse(useParams().bookingId).data;
  const query = useQuery({
    ...bookingQuery(store.authorizedRequest, bookingId ?? ''),
    enabled: bookingId !== undefined,
  });
  const [cancelled, setCancelled] = useState<CancelledBooking>();

  if (bookingId === undefined || isApiError(query.error, 'not_found')) {
    return <BookingNotFound navTitle={t('booking.detail.navTitle')} />;
  }
  if (query.isError && query.data === undefined) {
    return (
      <LoadFailed
        navTitle={t('booking.detail.navTitle')}
        title={t('booking.confirmation.failedTitle')}
        error={query.error}
        retry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const booking = query.data;

  const onCancelled = (result: CancelledBooking) => {
    setCancelled(result);
    queryClient.setQueryData(bookingKey(bookingId), result);
    void queryClient.invalidateQueries({ queryKey: myBookingsKey });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      <TopNavBar title={t('booking.detail.navTitle')} showBack={true} />

      {booking ? (
        <>
          <div className="flex flex-col items-start gap-3 px-5 pt-6 pb-5 rim">
            <StatusBadge status={booking.status} />
            <h1 className="text-headline-lg font-bold text-ink tracking-tight">
              {booking.provider.display_name}
            </h1>
            <BookingCountdown booking={booking} />
          </div>
          <div className="flex flex-col px-5 pt-5">
            {cancelled && <CancelledNotice result={cancelled} />}
            <BookingCode code={booking.code} />
            <BookingDetails booking={booking} />
            <RatingCard booking={booking} />
            <PriceCard booking={booking} />
            <TimesCard booking={booking} />
            <StatusHistory history={booking.status_history} />
            <CancelSection
              booking={booking}
              refresh={() => query.refetch()}
              onCancelled={onCancelled}
            />
            {canBookAgain(booking) && <BookAgainButton booking={booking} />}
          </div>
        </>
      ) : (
        <BookingSkeleton />
      )}
    </div>
  );
};

export default BookingDetail;
