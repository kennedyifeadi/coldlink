import React from 'react';
import { CalendarDays, Home, Leaf, MapPin, Phone, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FarmerBooking } from '@coldlink/shared';
import Card from '../../components/ui/Card';
import { formatDate } from '../../i18n/format';
import { formatPhoneForDisplay } from '../auth/phoneDisplay';
import { formatAmount } from '../search/units';

export const DetailRow = ({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-start gap-3">
    <Icon size={18} className="text-copy-subtle mt-0.5 shrink-0" aria-hidden="true" />
    <div className="min-w-0">
      <p className="text-copy-muted text-label">{label}</p>
      {children}
    </div>
  </div>
);

/** Where and what: the cold room, its address and phone once it has accepted, produce and dates. */
export const BookingDetails = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();
  const { provider } = booking;

  return (
    <Card className="p-5 mb-4">
      <h2 className="font-semibold text-ink text-subtitle mb-4">
        {t('booking.confirmation.detailsTitle')}
      </h2>
      <div className="flex flex-col gap-4">
        <DetailRow icon={Home} label={t('booking.confirmation.coldRoom')}>
          <p className="text-ink text-body">{provider.display_name}</p>
        </DetailRow>
        <DetailRow icon={MapPin} label={t('booking.confirmation.address')}>
          <p className="text-ink text-body">{provider.address_text}</p>
          {provider.landmark && (
            <p className="text-ink text-body">
              {t('booking.details.near', { landmark: provider.landmark })}
            </p>
          )}
          {provider.lga && (
            <p className="text-ink text-body">{t('booking.detail.lga', { lga: provider.lga })}</p>
          )}
        </DetailRow>
        {provider.phone && (
          <DetailRow icon={Phone} label={t('booking.detail.phone')}>
            <a
              href={`tel:${provider.phone}`}
              aria-label={t('booking.detail.call', { facility: provider.display_name })}
              className="inline-flex min-h-12 items-center text-primary-strong font-semibold text-lead underline underline-offset-4"
            >
              {formatPhoneForDisplay(provider.phone)}
            </a>
          </DetailRow>
        )}
        <DetailRow icon={Leaf} label={t('booking.confirmation.produce')}>
          <p className="text-ink text-body">
            {t('booking.confirmation.produceValue', {
              produce: booking.crop.name,
              amount: formatAmount(booking.quantity, booking.capacity_unit, t),
            })}
          </p>
        </DetailRow>
        <DetailRow icon={CalendarDays} label={t('booking.confirmation.dates')}>
          <p className="text-ink text-body">
            {t('booking.confirmation.datesValue', {
              start: formatDate(booking.start_date),
              end: formatDate(booking.end_date),
              count: booking.duration_days,
            })}
          </p>
        </DetailRow>
      </div>
    </Card>
  );
};

/** The booking code, large, to show at the facility. */
export const BookingCode = ({ code }: { code: string }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border-2 border-primary p-5 mb-4">
      <h2 className="text-copy-muted text-label font-medium">
        {t('booking.confirmation.codeTitle')}
      </h2>
      <p className="text-ink font-bold text-display tracking-wider tabular-nums my-1">{code}</p>
      <p className="text-copy-muted text-label">{t('booking.confirmation.codeHint')}</p>
    </div>
  );
};
