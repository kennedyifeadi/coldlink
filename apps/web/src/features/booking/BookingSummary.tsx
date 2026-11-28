import React from 'react';
import { useTranslation } from 'react-i18next';
import type { BookingQuote } from '@coldlink/shared';
import Card from '../../components/ui/Card';
import Notice from '../../components/ui/Notice';
import CardTitle from '../../components/ui/CardTitle';
import SummaryRow from '../../components/ui/SummaryRow';
import { formatDate, formatKobo } from '../../i18n/format';
import { formatAmount } from '../search/units';

/** What a quote and a booking both carry, so either can be shown the same way. */
export type BookingTerms = Pick<
  BookingQuote,
  | 'quantity'
  | 'capacity_unit'
  | 'start_date'
  | 'end_date'
  | 'duration_days'
  | 'storage_subtotal_kobo'
  | 'deposit_kobo'
  | 'service_fee_kobo'
  | 'delivery_fee_kobo'
  | 'balance_due_kobo'
  | 'total_charged_online_kobo'
>;

interface BookingSummaryProps {
  facility: { display_name: string; address_text: string };
  cropName: string;
  terms: BookingTerms | undefined;
}

export const BookingSummary = ({ facility, cropName, terms }: BookingSummaryProps) => {
  const { t } = useTranslation();

  return (
    <Card className="p-5">
      <h2 className="font-bold text-ink text-subtitle">{facility.display_name}</h2>
      <p className="text-copy-muted text-label mt-0.5">{facility.address_text}</p>

      <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-line">
        <SummaryRow label={t('booking.review.produce')} value={cropName} />
        {terms && (
          <>
            <SummaryRow
              label={t('booking.review.quantity')}
              value={formatAmount(terms.quantity, terms.capacity_unit, t)}
            />
            <SummaryRow label={t('booking.review.dropOff')} value={formatDate(terms.start_date)} />
            <SummaryRow label={t('booking.review.collect')} value={formatDate(terms.end_date)} />
            <SummaryRow
              label={t('booking.review.duration')}
              value={t('booking.review.durationValue', { count: terms.duration_days })}
            />
          </>
        )}
      </div>
    </Card>
  );
};

export const PayNowNotice = ({ terms, facility }: { terms: BookingTerms; facility: string }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border-2 border-primary bg-primary-faint p-5">
      <p className="font-bold text-headline text-ink mb-1 tabular-nums">
        {t('booking.review.payNow', { amount: formatKobo(terms.total_charged_online_kobo) })}
      </p>
      <p className="text-copy-muted text-body">
        {t('booking.review.payNowBody', {
          balance: formatKobo(terms.balance_due_kobo),
          facility,
        })}
      </p>
    </div>
  );
};

interface PriceBreakdownProps {
  terms: BookingTerms;
  facility: string;
  /** Said instead of the amount to pay while the figures are not yet the final ones. */
  pending?: string;
}

// Every figure is the API's, as it worked it out; the screen adds nothing up (PRD 7.4).
export const PriceBreakdown = ({ terms, facility, pending }: PriceBreakdownProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Card className="p-5">
        <CardTitle>{t('booking.review.priceTitle')}</CardTitle>
        <div className="flex flex-col gap-3">
          <SummaryRow
            label={t('booking.review.storage', { count: terms.duration_days })}
            value={formatKobo(terms.storage_subtotal_kobo)}
          />
          <div className="h-px bg-line w-full" />
          <SummaryRow
            label={t('booking.review.deposit')}
            value={formatKobo(terms.deposit_kobo)}
            variant="highlight"
          />
          <SummaryRow
            label={t('booking.review.serviceFee')}
            value={formatKobo(terms.service_fee_kobo)}
            variant="highlight"
          />
          {terms.delivery_fee_kobo > 0 && (
            <SummaryRow
              label={t('booking.review.delivery')}
              value={formatKobo(terms.delivery_fee_kobo)}
              variant="highlight"
            />
          )}
          <SummaryRow
            label={t('booking.review.balance')}
            value={formatKobo(terms.balance_due_kobo)}
          />
        </div>
      </Card>
      {pending === undefined ? (
        <PayNowNotice terms={terms} facility={facility} />
      ) : (
        <Notice>{pending}</Notice>
      )}
    </>
  );
};
