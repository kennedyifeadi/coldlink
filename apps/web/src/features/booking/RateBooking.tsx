import React, { useRef, useState, type FormEvent } from 'react';
import { CircleCheck, CircleSlash, Hourglass } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import {
  RATING_COMMENT_MAX_LENGTH,
  type BookingRating,
  type FarmerBooking,
  type RateBookingBody,
} from '@coldlink/shared';
import { bookingKey, bookingQuery, myBookingsKey, rateBooking } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { bookingDetailPath } from '../../session/routes';
import { useSessionStore } from '../../session/sessionContext';
import { BookingNotFound, BookingSkeleton, LoadFailed, ProblemScreen } from './BookingStates';
import { STATUS_TONES } from './bookingStatus';
import { RatingSummary, StarPicker, type Stars } from './RatingStars';

const COMMENT_ID = 'rating-comment';
const STARS_ERROR_ID = 'rating-stars-error';

/** A booking that is not completed: still to be collected, or ended without storage. */
const NotRateable = ({ booking }: { booking: FarmerBooking }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ended = STATUS_TONES[booking.status] === 'ended';

  return (
    <ProblemScreen
      navTitle={t('booking.rating.navTitle')}
      icon={ended ? CircleSlash : Hourglass}
      title={ended ? t('booking.rating.endedTitle') : t('booking.rating.notReadyTitle')}
      body={
        ended
          ? t('booking.rating.endedBody')
          : t('booking.rating.notReadyBody', { facility: booking.provider.display_name })
      }
      action={t('booking.rating.seeBooking')}
      onAction={() => void navigate(bookingDetailPath(booking.id), { replace: true })}
    />
  );
};

interface RatedProps {
  booking: FarmerBooking;
  rating: BookingRating;
  justNow: boolean;
}

/** Thanks straight after rating, or the rating given before: a booking is rated once. */
const Rated = ({ booking, rating, justNow }: RatedProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background pb-10">
      <TopNavBar title={t('booking.rating.navTitle')} showBack={true} />
      <div className="flex flex-col px-5 pt-6">
        <div role="status" className="flex gap-3 mb-6">
          <CircleCheck size={28} className="text-primary-strong shrink-0 mt-1" aria-hidden="true" />
          <div>
            <h1 className="font-heading text-headline font-bold text-ink mb-2">
              {justNow
                ? t('booking.rating.thanksTitle', { facility: booking.provider.display_name })
                : t('booking.rating.ratedTitle')}
            </h1>
            <p className="text-copy-muted text-lead leading-relaxed">
              {justNow ? t('booking.rating.thanksBody') : t('booking.rating.ratedBody')}
            </p>
          </div>
        </div>
        <Card className="p-6 mb-6">
          <h2 className="font-heading font-semibold text-ink text-subtitle mb-3">
            {t('booking.rating.yourRating')}
          </h2>
          <RatingSummary rating={rating} />
        </Card>
        <PrimaryButton onClick={() => void navigate(bookingDetailPath(booking.id))}>
          {t('booking.rating.seeBooking')}
        </PrimaryButton>
      </div>
    </div>
  );
};

const bodyOf = (stars: Stars, comment: string): RateBookingBody =>
  comment.trim() === '' ? { stars } : { stars, comment };

interface RatingFormProps {
  booking: FarmerBooking;
  onRated: (booking: FarmerBooking) => Promise<void>;
  onRefused: () => void;
}

/**
 * Stars and an optional comment, kept on screen through a failed send. A ref drops a second tap
 * made before the screen updates, as on the provider's actions (decision 121).
 */
const RatingForm = ({ booking, onRated, onRefused }: RatingFormProps) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const [stars, setStars] = useState<Stars>();
  const [comment, setComment] = useState('');
  const [missingStars, setMissingStars] = useState(false);
  const inFlight = useRef(false);

  const send = useMutation({
    mutationFn: (body: RateBookingBody) => rateBooking(store.authorizedRequest, booking.id, body),
    onSuccess: onRated,
    // Rated elsewhere, no longer completed, or gone: reading the booking again shows which.
    onError: (error) => {
      if (isApiError(error, 'conflict') || isApiError(error, 'not_found')) onRefused();
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (stars === undefined) {
      setMissingStars(true);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    send.mutate(bodyOf(stars, comment));
  };

  const busy = send.isPending;
  const failed =
    send.isError && !isApiError(send.error, 'conflict') && !isApiError(send.error, 'not_found');

  return (
    <form onSubmit={submit} noValidate className="flex flex-col px-5 pt-6">
      <h1 className="font-heading text-headline font-bold text-ink mb-2">
        {t('booking.rating.title', { facility: booking.provider.display_name })}
      </h1>
      <p className="text-copy-muted text-lead leading-relaxed mb-6">
        {t('booking.rating.intro', { code: booking.code })}
      </p>

      <Card className="p-5 mb-4">
        <StarPicker
          value={stars}
          onChange={(value) => {
            setStars(value);
            setMissingStars(false);
          }}
          disabled={busy}
          describedBy={missingStars ? STARS_ERROR_ID : undefined}
        />
        {missingStars && (
          <div className="mt-2">
            <ErrorMessage id={STARS_ERROR_ID}>{t('booking.rating.chooseStars')}</ErrorMessage>
          </div>
        )}
      </Card>

      <Card className="p-5 mb-6">
        <label htmlFor={COMMENT_ID} className="block text-label font-medium text-copy mb-2">
          {t('booking.rating.commentLabel')}
          <span className="text-copy-subtle font-normal"> {t('booking.rating.optional')}</span>
        </label>
        <p id={`${COMMENT_ID}-hint`} className="text-copy-muted text-body mb-3">
          {t('booking.rating.commentHint')}
        </p>
        <textarea
          id={COMMENT_ID}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={RATING_COMMENT_MAX_LENGTH}
          rows={4}
          disabled={busy}
          aria-describedby={`${COMMENT_ID}-hint ${COMMENT_ID}-count`}
          className="w-full px-4 py-3.5 text-body text-copy bg-surface border border-line-strong rounded-lg placeholder-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all resize-y disabled:bg-surface-muted"
        />
        <p id={`${COMMENT_ID}-count`} className="text-copy-subtle text-label mt-2 text-right">
          {t('booking.rating.commentCount', {
            count: comment.length,
            max: RATING_COMMENT_MAX_LENGTH,
          })}
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        {failed && !busy && <ErrorMessage>{describeApiError(send.error, t)}</ErrorMessage>}
        <PrimaryButton type="submit" disabled={busy}>
          {busy
            ? t('booking.rating.sending')
            : failed && isApiError(send.error, 'network')
              ? t('common.tryAgain')
              : t('booking.rating.submit')}
        </PrimaryButton>
      </div>
    </form>
  );
};

/** PRD 7.8: rate a completed booking once, from its detail or the rating_request SMS. */
const RateBooking = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const bookingId = z.uuid().safeParse(useParams().bookingId).data;
  const query = useQuery({
    ...bookingQuery(store.authorizedRequest, bookingId ?? ''),
    enabled: bookingId !== undefined,
  });
  const [justRated, setJustRated] = useState(false);
  const navTitle = t('booking.rating.navTitle');

  if (bookingId === undefined || isApiError(query.error, 'not_found')) {
    return <BookingNotFound navTitle={navTitle} />;
  }
  if (query.isError && query.data === undefined) {
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
  if (booking?.rating)
    return <Rated booking={booking} rating={booking.rating} justNow={justRated} />;
  if (booking && booking.status !== 'completed') return <NotRateable booking={booking} />;

  // The answer is the rated booking; My bookings and the booking are read again behind it.
  const onRated = async (rated: FarmerBooking) => {
    setJustRated(true);
    queryClient.setQueryData(bookingKey(rated.id), rated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: bookingKey(rated.id) }),
      queryClient.invalidateQueries({ queryKey: myBookingsKey }),
    ]);
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-10">
      <TopNavBar title={navTitle} showBack={true} />
      {booking ? (
        <RatingForm booking={booking} onRated={onRated} onRefused={() => void query.refetch()} />
      ) : (
        <BookingSkeleton />
      )}
    </div>
  );
};

export default RateBooking;
