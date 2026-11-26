import React, { useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import type { ProviderBookingDetail } from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { actOnBooking, facilityKey, type ProviderBookingAction } from '../../api/providerBookings';
import Card from '../../components/ui/Card';
import DangerButton from '../../components/ui/DangerButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import Notice from '../../components/ui/Notice';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SecondaryButton from '../../components/ui/SecondaryButton';
import TextButton from '../../components/ui/TextButton';
import { formatDate, formatKobo, formatLagosTime } from '../../i18n/format';
import { useSessionStore } from '../../session/sessionContext';

const earlyCheckInSchema = z.object({ start_date: z.iso.date() });

/** Why the API refused the action with a 409, read after the booking is reloaded. */
const conflictMessage = (action: ProviderBookingAction, error: unknown, t: TFunction) => {
  if (action === 'check-in') {
    const early = isApiError(error) ? earlyCheckInSchema.safeParse(error.details) : undefined;
    return early?.success
      ? t('provider.booking.conflict.checkInEarly', { date: formatDate(early.data.start_date) })
      : t('provider.booking.conflict.checkIn');
  }
  if (action === 'collect') return t('provider.booking.conflict.collect');
  return t('provider.booking.conflict.answer');
};

export interface ActionOutcome {
  action: ProviderBookingAction;
  /** 'done', or a 409 explained in words. */
  result: 'done' | { conflict: string };
}

interface BookingActionsProps {
  booking: ProviderBookingDetail;
  onOutcome: (outcome: ActionOutcome) => void;
}

/**
 * The one move the booking's status allows: answer, check in or mark collected. Reject asks once
 * more, as on the SMS link (decision 108); a ref drops a second tap made before the screen updates.
 */
const BookingActions = ({ booking, onOutcome }: BookingActionsProps) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const [confirmingReject, setConfirmingReject] = useState(false);
  const inFlight = useRef(false);
  const providerId = booking.provider.id;

  const refresh = () => queryClient.invalidateQueries({ queryKey: facilityKey(providerId) });
  const act = useMutation({
    mutationFn: (action: ProviderBookingAction) =>
      actOnBooking(store.authorizedRequest, booking.id, action),
    // Waits for the fresh reads, so the buttons stay disabled until the new status is on screen.
    onSuccess: async (_booking, action) => {
      setConfirmingReject(false);
      onOutcome({ action, result: 'done' });
      await refresh();
    },
    onError: (error, action) => {
      if (isApiError(error, 'conflict')) {
        setConfirmingReject(false);
        onOutcome({ action, result: { conflict: conflictMessage(action, error, t) } });
      }
      // A 409 or 404 means the booking moved or went: read it again to show where it stands.
      if (isApiError(error, 'conflict') || isApiError(error, 'not_found')) void refresh();
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const run = (action: ProviderBookingAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    act.mutate(action);
  };

  const pending = act.isPending ? act.variables : undefined;
  const busy = pending !== undefined;
  // A 409 is explained above the booking; a dropped connection or other failure is shown here.
  const failed =
    act.isError && !isApiError(act.error, 'conflict') && !isApiError(act.error, 'not_found')
      ? act.variables
      : undefined;
  const label = (action: ProviderBookingAction, idle: string, working: string) =>
    pending === action
      ? working
      : failed === action && isApiError(act.error, 'network')
        ? t('common.tryAgain')
        : idle;
  const errorNotice = failed !== undefined && !busy && (
    <ErrorMessage>{describeApiError(act.error, t)}</ErrorMessage>
  );

  if (booking.status === 'pending_provider') {
    const due = booking.provider_response_due_at;
    return (
      <div className="flex flex-col gap-3 mb-6">
        {due && (
          <Notice tone="waiting" title={t('provider.booking.answerBy', formatLagosTime(due))}>
            {t('provider.booking.answerByHint')}
          </Notice>
        )}
        {errorNotice}
        {confirmingReject ? (
          <Card className="p-5">
            <p className="text-ink text-body font-semibold mb-4">
              {t('provider.booking.rejectQuestion')}
            </p>
            <div className="flex flex-col gap-3">
              <DangerButton onClick={() => run('reject')} disabled={busy}>
                {label(
                  'reject',
                  t('provider.booking.confirmReject'),
                  t('provider.booking.rejecting'),
                )}
              </DangerButton>
              <TextButton onClick={() => setConfirmingReject(false)} disabled={busy}>
                {t('provider.booking.keep')}
              </TextButton>
            </div>
          </Card>
        ) : (
          <>
            <PrimaryButton onClick={() => run('accept')} disabled={busy}>
              {label('accept', t('provider.booking.accept'), t('provider.booking.accepting'))}
            </PrimaryButton>
            <SecondaryButton onClick={() => setConfirmingReject(true)} disabled={busy}>
              {t('provider.booking.reject')}
            </SecondaryButton>
          </>
        )}
      </div>
    );
  }

  if (booking.status === 'confirmed') {
    return (
      <Card className="p-5 mb-6">
        <h2 className="font-semibold text-ink text-subtitle mb-1">
          {t('provider.booking.checkInTitle')}
        </h2>
        <p className="text-copy-muted text-body mb-4">
          {t('provider.booking.checkInBody', { date: formatDate(booking.start_date) })}
        </p>
        <div className="flex flex-col gap-3">
          {errorNotice}
          <PrimaryButton onClick={() => run('check-in')} disabled={busy}>
            {label('check-in', t('provider.booking.checkIn'), t('provider.booking.checkingIn'))}
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  if (booking.status === 'in_storage') {
    return (
      <div className="rounded-xl border-2 border-primary p-5 mb-6">
        <p className="text-copy-muted text-label font-medium">
          {t('provider.booking.collectLabel')}
        </p>
        <p className="font-bold text-display text-ink tabular-nums break-words my-1">
          {formatKobo(booking.balance_due_kobo)}
        </p>
        <p className="text-copy-muted text-body mb-4">{t('provider.booking.collectBody')}</p>
        <div className="flex flex-col gap-3">
          {errorNotice}
          <PrimaryButton onClick={() => run('collect')} disabled={busy}>
            {label('collect', t('provider.booking.collect'), t('provider.booking.collecting'))}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return null;
};

export default BookingActions;
