import React, { useRef, useState } from 'react';
import { Ban } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import {
  deliveryDirectionSchema,
  deliveryRefusal,
  validationIssueSchema,
  type DeliveryDetailsBody,
  type DeliveryDirection,
  type DeliveryRefusal,
  type FarmerBooking,
} from '@coldlink/shared';
import { bookingKey, bookingQuery } from '../../api/bookings';
import { isApiError } from '../../api/client';
import {
  createDelivery,
  deliveryRefusalOf,
  initializeDeliveryPayment,
  quoteDelivery,
} from '../../api/deliveries';
import { describeApiError } from '../../api/describeError';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PageHeader from '../../components/ui/PageHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatKobo } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';
import { bookingDetailPath } from '../../session/routes';
import { BookingNotFound, BookingSkeleton, LoadFailed, ProblemScreen } from './BookingStates';
import DeliveryForm from './DeliveryForm';
import {
  deliveryFieldOf,
  deliveryLoadOf,
  emptyDeliveryForm,
  readDeliveryForm,
  type DeliveryFormErrors,
  type DeliveryFormValues,
} from './deliveryFields';
import { DeliveryPrice } from './PickupSection';
import { isStepError, PaymentStepError, runStep, usePaymentAttempt } from './usePaymentAttempt';

const validationDetailsSchema = z.array(validationIssueSchema);

/** The API's message for each form field `POST /deliveries` refused (decision 89). */
const apiDeliveryErrors = (error: unknown): DeliveryFormErrors => {
  if (!isApiError(error, 'validation_failed')) return {};
  const errors: DeliveryFormErrors = {};
  for (const { path, message } of validationDetailsSchema.safeParse(error.details).data ?? []) {
    const field = deliveryFieldOf(path);
    if (field && !errors[field]) errors[field] = message;
  }
  return errors;
};

interface RefusedProps {
  bookingId: string;
  direction: DeliveryDirection;
  refusal: DeliveryRefusal | 'not_payable';
}

/** Why this delivery can't be asked for or paid now, with the way back to the booking. */
const Refused = ({ bookingId, direction, refusal }: RefusedProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const title = t(`booking.delivery.${direction}Title`);
  const copy =
    refusal === 'not_payable'
      ? { title, body: t('booking.delivery.refused.notPayable') }
      : {
          title: t(`booking.delivery.refused.${refusal}.${direction}`),
          body:
            refusal === 'already_live'
              ? t('booking.delivery.refused.already_live.body')
              : t(`booking.delivery.refused.${refusal}.${direction}Body`),
        };

  return (
    <ProblemScreen
      navTitle={title}
      icon={Ban}
      title={copy.title}
      body={copy.body}
      action={t('booking.delivery.refused.backToBooking')}
      onAction={() => {
        // The booking changed under this screen; its detail must not show the old state.
        void queryClient.invalidateQueries({ queryKey: bookingKey(bookingId) });
        void navigate(bookingDetailPath(bookingId), { replace: true });
      }}
    />
  );
};

const withoutFields = (errors: DeliveryFormErrors, changed: Partial<DeliveryFormValues>) =>
  Object.fromEntries(
    Object.entries(errors).filter(([field]) => !(field in changed)),
  ) as DeliveryFormErrors;

interface RequestFormProps {
  booking: FarmerBooking;
  direction: DeliveryDirection;
}

const RequestForm = ({ booking, direction }: RequestFormProps) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const unit = booking.capacity_unit;
  const [values, setValues] = useState(() =>
    emptyDeliveryForm({ crop: booking.crop.name, quantity: booking.quantity }),
  );
  const [errors, setErrors] = useState<DeliveryFormErrors>({});
  // A request already made is paid on a retry, not asked for again; an edit asks again.
  const requested = useRef<string>(undefined);

  const load = deliveryLoadOf(values, unit);
  const quote = useQuery({
    queryKey: ['deliveryQuote', booking.id, direction, load ?? null],
    queryFn: ({ signal }) =>
      quoteDelivery(
        store.authorizedRequest,
        { direction, booking_id: booking.id, ...load! },
        signal,
      ),
    enabled: load !== undefined,
    placeholderData: keepPreviousData,
  });
  const current =
    load !== undefined && quote.data && !quote.isPlaceholderData ? quote.data : undefined;

  const attempt = usePaymentAttempt(async (details: DeliveryDetailsBody) => {
    let deliveryId = requested.current;
    if (deliveryId === undefined) {
      const delivery = await runStep('book', () =>
        createDelivery(store.authorizedRequest, {
          booking_id: booking.id,
          direction,
          ...details,
        }),
      );
      deliveryId = delivery.id;
      requested.current = deliveryId;
      void queryClient.invalidateQueries({ queryKey: bookingKey(booking.id) });
    }
    const charge = await runStep('pay', () =>
      initializeDeliveryPayment(store.authorizedRequest, deliveryId),
    );
    return charge.authorization_url;
  });

  const failure = attempt.error instanceof PaymentStepError ? attempt.error.cause : attempt.error;
  const refusal =
    deliveryRefusalOf(quote.error) ??
    (isStepError(attempt.error, 'book') ? deliveryRefusalOf(failure) : undefined);
  if (refusal) return <Refused bookingId={booking.id} direction={direction} refusal={refusal} />;
  if (isStepError(attempt.error, 'pay') && isApiError(failure, 'conflict')) {
    return <Refused bookingId={booking.id} direction={direction} refusal="not_payable" />;
  }

  const fieldErrors = { ...apiDeliveryErrors(failure), ...errors };
  const otherFailure =
    failure !== null && Object.keys(apiDeliveryErrors(failure)).length === 0
      ? describeApiError(failure, t)
      : undefined;

  const change = (changes: Partial<DeliveryFormValues>) => {
    setValues((previous) => ({ ...previous, ...changes }));
    setErrors((previous) => withoutFields(previous, changes));
    requested.current = undefined;
    attempt.reset();
  };

  const pay = () => {
    const result = readDeliveryForm(values, unit, current, t);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    if (current) attempt.start(result.details);
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-5 pb-6">
      <Card className="p-5 flex flex-col gap-5">
        <DeliveryForm
          direction={direction}
          unit={unit}
          values={values}
          onChange={change}
          errors={fieldErrors}
          window={current}
        />
        {current && <DeliveryPrice quote={current} />}
      </Card>
      {quote.isError && !refusal && <ErrorMessage>{describeApiError(quote.error, t)}</ErrorMessage>}
      {current ? (
        <div className="rounded-xl border-2 border-primary bg-primary-faint p-5">
          <p className="font-bold text-headline text-ink tabular-nums">
            {t('booking.review.payNow', { amount: formatKobo(current.fee_kobo) })}
          </p>
        </div>
      ) : (
        load !== undefined &&
        quote.isFetching && (
          <p role="status" className="text-copy-muted text-body">
            {t('booking.delivery.checkingPrice')}
          </p>
        )
      )}
      <div className="flex flex-col gap-3 mt-2">
        {attempt.redirecting && (
          <p role="status" className="text-copy-muted text-body">
            {t('booking.payment.openingNote')}
          </p>
        )}
        {otherFailure && <ErrorMessage>{otherFailure}</ErrorMessage>}
        <PrimaryButton onClick={pay} disabled={attempt.redirecting}>
          {attempt.redirecting
            ? t('booking.payment.opening')
            : isApiError(failure, 'network')
              ? t('common.tryAgain')
              : current
                ? t('booking.payAmount', { amount: formatKobo(current.fee_kobo) })
                : t('common.continue')}
        </PrimaryButton>
      </div>
    </div>
  );
};

/** A delivery asked for after booking, paid on its own (PRD 7.7 step 3, decisions 141, 143). */
const RequestDelivery = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const params = useParams();
  const bookingId = z.uuid().safeParse(params.bookingId).data;
  const direction = deliveryDirectionSchema.safeParse(params.direction).data;
  const query = useQuery({
    ...bookingQuery(store.authorizedRequest, bookingId ?? ''),
    enabled: bookingId !== undefined && direction !== undefined,
  });
  const navTitle = t(`booking.delivery.${direction ?? 'inbound'}Title`);

  if (!bookingId || !direction || isApiError(query.error, 'not_found')) {
    return <BookingNotFound navTitle={t('booking.detail.navTitle')} />;
  }
  if (query.isError) {
    return (
      <LoadFailed
        navTitle={navTitle}
        title={t('booking.confirmation.failedTitle')}
        error={query.error}
        retry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const booking = query.data;
  // Judged when the booking was read, as the API judges it when asked (decision 141).
  const refusal = booking && deliveryRefusal(direction, booking, new Date(query.dataUpdatedAt));
  if (booking && refusal) {
    return <Refused bookingId={booking.id} direction={direction} refusal={refusal} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      <TopNavBar title={navTitle} showBack={true} />
      {booking ? (
        <>
          <PageHeader
            title={navTitle}
            intro={t(`booking.delivery.${direction}Intro`, {
              facility: booking.provider.display_name,
            })}
          />
          <RequestForm booking={booking} direction={direction} />
        </>
      ) : (
        <BookingSkeleton />
      )}
    </div>
  );
};

export default RequestDelivery;
