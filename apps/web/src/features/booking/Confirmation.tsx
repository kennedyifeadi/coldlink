import React from 'react';
import { CheckCircle2, CircleDot, Hourglass, SearchX, Share2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';
import type { FarmerBooking } from '@coldlink/shared';
import logoMain from '../../assets/logo_main.webp';
import { bookingQuery } from '../../api/bookings';
import { isApiError } from '../../api/client';
import Card from '../../components/ui/Card';
import SummaryRow from '../../components/ui/SummaryRow';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import { formatDate, formatKobo, formatLagosTime } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import { MY_BOOKINGS_PATH } from '../../session/routes';
import { BookingCode, BookingDetails } from './BookingFacts';
import { LoadFailed, ProblemScreen } from './BookingStates';
import { isPaidAndStanding, whatsappShareUrl } from './paymentFlow';

const StatusHeader = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();
  const facility = booking.provider.display_name;
  const header =
    booking.status === 'pending_provider' && booking.provider_response_due_at !== null
      ? {
          icon: Hourglass,
          title: t('booking.confirmation.waitingTitle', { facility }),
          body: t('booking.confirmation.waitingBody', {
            facility,
            ...formatLagosTime(booking.provider_response_due_at),
          }),
        }
      : booking.status === 'confirmed'
        ? {
            icon: CheckCircle2,
            title: t('booking.confirmation.confirmedTitle'),
            body: t('booking.confirmation.confirmedBody', {
              facility,
              date: formatDate(booking.start_date),
            }),
          }
        : {
            icon: CircleDot,
            title: t('booking.confirmation.otherTitle'),
            body: t('booking.confirmation.statusValue', {
              status: t(`booking.status.${booking.status}`),
            }),
          };
  const Icon = header.icon;

  return (
    <div className="flex flex-col items-center text-center mb-8">
      <div className="w-16 h-16 bg-primary-faint rounded-full flex items-center justify-center text-primary-strong mb-4">
        <Icon size={32} strokeWidth={2.5} aria-hidden="true" />
      </div>
      <h1 className="font-heading text-title font-bold text-ink mb-2">{header.title}</h1>
      <p className="text-copy-muted text-body leading-relaxed max-w-sm">{header.body}</p>
    </div>
  );
};

/** The code and where to bring the produce: nothing about the price or anyone's phone. */
const shareText = (booking: FarmerBooking, t: TFunction) => {
  const { display_name, address_text, landmark } = booking.provider;
  const terms = { code: booking.code, facility: display_name, address: address_text };
  return landmark
    ? t('booking.confirmation.shareTextNear', { ...terms, landmark })
    : t('booking.confirmation.shareText', terms);
};

const PaymentDetails = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();

  return (
    <Card className="p-6 mb-8">
      <h2 className="text-copy-muted text-label font-medium mb-5">
        {t('booking.confirmation.paymentTitle')}
      </h2>
      <div className="mb-4">
        <SummaryRow
          label={t('booking.confirmation.paidOnline')}
          value={formatKobo(booking.total_charged_online_kobo)}
          variant="highlight"
        />
      </div>
      <div className="h-[1px] bg-line mb-4 w-full"></div>
      <div className="mb-1.5">
        <SummaryRow
          label={t('booking.confirmation.dueAtFacility')}
          value={formatKobo(booking.balance_due_kobo)}
        />
      </div>
      <p className="text-right text-copy-subtle text-caption">
        {t('booking.confirmation.dueHint')}
      </p>
    </Card>
  );
};

const BookingNotFound = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={t('booking.myBookings.navTitle')}
      icon={SearchX}
      title={t('booking.confirmation.notFoundTitle')}
      body={t('booking.confirmation.notFoundBody')}
      action={t('booking.paymentReturn.goToBookings')}
      onAction={() => void navigate(MY_BOOKINGS_PATH, { replace: true })}
    />
  );
};

const ConfirmationSkeleton = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 px-5 pt-2">
      <p role="status" className="text-copy-muted text-body text-center">
        {t('common.loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-32 rounded-2xl bg-surface-muted" />
        <div className="h-36 rounded-2xl bg-surface-muted" />
        <div className="h-64 rounded-2xl bg-surface-muted" />
      </div>
    </div>
  );
};

/** A booking after payment: waiting for the facility, confirmed, or whatever became of it. */
const Confirmation = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const store = useSessionStore();
  const bookingId = z.uuid().safeParse(useParams().bookingId).data;
  const query = useQuery({
    ...bookingQuery(store.authorizedRequest, bookingId ?? ''),
    enabled: bookingId !== undefined,
  });

  if (bookingId === undefined || isApiError(query.error, 'not_found')) return <BookingNotFound />;
  if (query.isError) {
    return (
      <LoadFailed
        navTitle={t('booking.myBookings.navTitle')}
        title={t('booking.confirmation.failedTitle')}
        error={query.error}
        retry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const booking = query.data;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-10">
      <div className="flex justify-center items-center px-4 py-6">
        <img src={logoMain} alt={t('common.logoAlt')} width={138} height={32} />
      </div>

      {booking ? (
        <div className="flex flex-col px-5 pt-2 flex-grow">
          <StatusHeader booking={booking} />

          <BookingCode code={booking.code} />

          <BookingDetails booking={booking} />
          {isPaidAndStanding(booking.status) && <PaymentDetails booking={booking} />}

          <div className="flex flex-col gap-4 mt-auto">
            <PrimaryButton onClick={() => void navigate(MY_BOOKINGS_PATH)} withArrow>
              {t('booking.confirmation.viewBookings')}
            </PrimaryButton>
            <a
              href={whatsappShareUrl(shareText(booking, t))}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-12 py-4 flex items-center justify-center gap-2 bg-surface border border-line-strong text-ink font-medium text-lead hover:bg-surface-muted rounded-lg transition-colors"
            >
              <Share2 size={20} aria-hidden="true" />
              {t('booking.confirmation.share')}
            </a>
            <TextButton onClick={() => void navigate('/')}>
              {t('booking.confirmation.backHome')}
            </TextButton>
          </div>
        </div>
      ) : (
        <ConfirmationSkeleton />
      )}
    </div>
  );
};

export default Confirmation;
