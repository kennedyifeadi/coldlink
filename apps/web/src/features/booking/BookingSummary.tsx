import React from 'react';
import { MapPin, Snowflake } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BookingQuote } from '@coldlink/shared';
import Card from '../../components/ui/Card';
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
    <Card tone="muted" className="p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-ink shrink-0">
          <Snowflake size={20} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-ink text-lead">{facility.display_name}</h2>
          <div className="flex items-start text-copy-subtle text-label mt-0.5">
            <MapPin size={12} className="mr-1 mt-1 shrink-0" aria-hidden="true" />
            {facility.address_text}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl p-4 border border-line flex flex-col gap-3">
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
    <div className="bg-accent rounded-2xl p-5">
      <p className="font-heading font-bold text-headline text-accent-ink mb-2 leading-tight">
        {t('booking.review.payNow', { amount: formatKobo(terms.total_charged_online_kobo) })}
      </p>
      <p className="text-accent-ink text-body leading-relaxed">
        {t('booking.review.payNowBody', {
          balance: formatKobo(terms.balance_due_kobo),
          facility,
        })}
      </p>
    </div>
  );
};

// Every figure is the API's, as it worked it out; the screen adds nothing up (PRD 7.4).
export const PriceBreakdown = ({ terms, facility }: { terms: BookingTerms; facility: string }) => {
  const { t } = useTranslation();

  return (
    <>
      <Card tone="muted" className="p-5">
        <CardTitle>{t('booking.review.priceTitle')}</CardTitle>
        <div className="flex flex-col gap-3">
          <SummaryRow
            label={t('booking.review.storage', { count: terms.duration_days })}
            value={formatKobo(terms.storage_subtotal_kobo)}
          />
          <div className="h-[1px] bg-line-strong w-full"></div>
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
      <PayNowNotice terms={terms} facility={facility} />
    </>
  );
};
