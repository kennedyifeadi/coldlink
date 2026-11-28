import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingDelivery, FarmerBooking, FarmerDelivery } from '@coldlink/shared';
import { bookingKey } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { deliveryQuery, initializeDeliveryPayment } from '../../api/deliveries';
import { describeApiError } from '../../api/describeError';
import Card from '../../components/ui/Card';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SummaryRow from '../../components/ui/SummaryRow';
import { formatDate, formatKobo, formatLagosTime } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import { DELIVERY_STATUS_LOOKS, deliveryStatusLabel, showsHandoverCode } from './deliveryStatus';
import { StatusPill } from './StatusBadge';
import { usePaymentAttempt } from './usePaymentAttempt';

/** The 4-digit code, large, with decision 152's instruction. */
const HandoverCode = ({ code }: { code: string }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border-2 border-primary p-4">
      <h4 className="text-copy-muted text-label font-medium">{t('booking.delivery.codeTitle')}</h4>
      <p className="text-ink font-bold text-display tracking-[0.3em] tabular-nums my-1">{code}</p>
      <p className="text-copy text-label">{t('booking.delivery.codeHint')}</p>
    </div>
  );
};

/** The partner's times so far, on the Lagos clock. */
const partnerTimes = (delivery: FarmerDelivery) =>
  [
    { key: 'driverFound', at: delivery.assigned_at },
    { key: 'pickedUpAt', at: delivery.picked_up_at },
    { key: 'deliveredAt', at: delivery.delivered_at },
  ] as const;

const PayDelivery = ({
  booking,
  delivery,
}: {
  booking: FarmerBooking;
  delivery: BookingDelivery;
}) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  // The open charge is reused (decision 143), so a second tap never charges twice.
  const attempt = usePaymentAttempt(async () => {
    try {
      const charge = await initializeDeliveryPayment(store.authorizedRequest, delivery.id);
      return charge.authorization_url;
    } catch (error) {
      // No longer payable: the booking moved on or the day passed; show where it stands now.
      if (isApiError(error, 'conflict')) {
        void queryClient.invalidateQueries({ queryKey: bookingKey(booking.id) });
      }
      throw error;
    }
  });

  return (
    <div className="flex flex-col gap-3">
      {attempt.error !== null && (
        <ErrorMessage>
          {isApiError(attempt.error, 'conflict')
            ? t('booking.delivery.refused.notPayable')
            : describeApiError(attempt.error, t)}
        </ErrorMessage>
      )}
      <PrimaryButton
        compact
        onClick={() => attempt.start(undefined)}
        disabled={attempt.redirecting}
      >
        {attempt.redirecting
          ? t('booking.payment.opening')
          : t('booking.payAmount', { amount: formatKobo(delivery.fee_kobo) })}
      </PrimaryButton>
    </div>
  );
};

interface DeliveryCardProps {
  booking: FarmerBooking;
  delivery: BookingDelivery;
}

/** One delivery of the booking: where it stands, its fee, and the code while it is under way. */
const DeliveryCard = ({ booking, delivery: summary }: DeliveryCardProps) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const detail = useQuery(deliveryQuery(store.authorizedRequest, summary.id));
  // The delivery's own read is newer than the booking's list once it arrives.
  const delivery = detail.data ?? summary;
  const label = deliveryStatusLabel(delivery);
  const looks = DELIVERY_STATUS_LOOKS[label];
  const titleId = `delivery-${summary.id}-title`;

  return (
    <Card className="p-5" labelledBy={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 id={titleId} className="font-semibold text-ink text-subtitle">
          {t(`booking.delivery.${delivery.direction}Title`)}
        </h3>
        <StatusPill tone={looks.tone} icon={looks.icon}>
          {t(`booking.delivery.status.${label}`)}
        </StatusPill>
      </div>
      <div className="flex flex-col gap-3">
        <SummaryRow label={t('booking.delivery.day')} value={formatDate(delivery.scheduled_for)} />
        <SummaryRow label={t('booking.delivery.fee')} value={formatKobo(delivery.fee_kobo)} />
        {detail.data && (
          <>
            <SummaryRow
              label={t('booking.delivery.contact')}
              value={
                detail.data.contact_name
                  ? `${detail.data.contact_name}, ${detail.data.contact_phone_masked}`
                  : detail.data.contact_phone_masked
              }
            />
            {partnerTimes(detail.data).map(
              ({ key, at }) =>
                at && (
                  <SummaryRow
                    key={key}
                    label={t(`booking.delivery.${key}`)}
                    value={t('booking.detail.at', formatLagosTime(at))}
                  />
                ),
            )}
          </>
        )}
        {detail.isError && <ErrorMessage>{t('booking.delivery.loadFailed')}</ErrorMessage>}
        {detail.data && showsHandoverCode(detail.data) && (
          <HandoverCode code={detail.data.handover_code} />
        )}
        {label === 'unpaid' &&
          (booking.status === 'payment_pending' ? (
            <p className="text-copy-muted text-label">{t('booking.delivery.paidWithBooking')}</p>
          ) : (
            <PayDelivery booking={booking} delivery={summary} />
          ))}
      </div>
    </Card>
  );
};

export default DeliveryCard;
