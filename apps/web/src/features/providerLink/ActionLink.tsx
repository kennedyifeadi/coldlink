import React, { useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, CircleX, Clock, Hourglass, WifiOff } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  ProviderBookingRequest,
  ProviderLinkAction,
  ProviderLinkActionResult,
} from '@coldlink/shared';
import { answerActionLink, fetchActionLink } from '../../api/actionLinks';
import { isApiError } from '../../api/client';
import { describeApiError, formatWait } from '../../api/describeError';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import DangerButton from '../../components/ui/DangerButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import Notice from '../../components/ui/Notice';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SecondaryButton from '../../components/ui/SecondaryButton';
import TextButton from '../../components/ui/TextButton';
import { formatDate, formatKobo, formatLagosTime } from '../../i18n/format';
import { formatAmount } from '../search/units';
import { useNoReferrer } from './useNoReferrer';

type Outcome = ProviderLinkActionResult['status'];

/** The errors that end the link's use on this screen; anything else can be tried again. */
const isFinal = (error: unknown) =>
  isApiError(error, 'not_found') ||
  isApiError(error, 'conflict') ||
  isApiError(error, 'rate_limited');

const Screen = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      <TopNavBar title={t('actionLink.navTitle')} />
      {children}
    </div>
  );
};

interface MessageScreenProps {
  icon: typeof CircleAlert;
  title: string;
  body: string;
  children?: ReactNode;
}

const MessageScreen = ({ icon: Icon, title, body, children }: MessageScreenProps) => (
  <Screen>
    <div className="px-5 pt-12 pb-6">
      <Icon size={28} className="text-copy-muted mb-4" aria-hidden="true" />
      <h1 className="text-headline font-bold text-ink mb-2 break-words">{title}</h1>
      <p className="text-copy-muted text-body">{body}</p>
    </div>
    {children && <div className="px-5 mt-10 flex flex-col gap-3">{children}</div>}
  </Screen>
);

/** One screen for every way the link can no longer be used here: never says which links exist. */
const FinalError = ({ error }: { error: unknown }) => {
  const { t } = useTranslation();

  if (isApiError(error, 'conflict')) {
    return (
      <MessageScreen
        icon={Clock}
        title={t('actionLink.conflictTitle')}
        body={t('actionLink.conflictBody')}
      />
    );
  }
  if (isApiError(error, 'rate_limited')) {
    const seconds = error.retryAfterSeconds;
    return (
      <MessageScreen
        icon={Hourglass}
        title={t('actionLink.rateLimitedTitle')}
        body={
          seconds === undefined
            ? t('actionLink.rateLimitedBody')
            : t('actionLink.rateLimitedWait', { wait: formatWait(seconds, t) })
        }
      />
    );
  }
  return (
    <MessageScreen
      icon={CircleAlert}
      title={t('actionLink.goneTitle')}
      body={t('actionLink.goneBody')}
    />
  );
};

const OutcomeScreen = ({
  outcome,
  request,
}: {
  outcome: Outcome;
  request: ProviderBookingRequest;
}) => {
  const { t } = useTranslation();

  if (outcome === 'rejected') {
    return (
      <MessageScreen
        icon={CircleX}
        title={t('actionLink.rejectedTitle')}
        body={t('actionLink.rejectedBody')}
      />
    );
  }
  return (
    <MessageScreen
      icon={CheckCircle2}
      title={t('actionLink.confirmedTitle')}
      body={t('actionLink.confirmedBody', { date: formatDate(request.start_date) })}
    >
      <Card className="p-6 text-center flex flex-col items-center">
        <h2 className="text-copy-muted text-label font-medium tracking-widest uppercase mb-4">
          {t('actionLink.codeTitle')}
        </h2>
        <p className="border border-primary-soft text-primary-strong font-bold text-headline tracking-widest py-3 px-6 rounded-xl mb-4 bg-surface">
          {request.code}
        </p>
        <p className="text-copy-muted text-body">{t('actionLink.codeHint')}</p>
      </Card>
    </MessageScreen>
  );
};

const RequestFacts = ({ request }: { request: ProviderBookingRequest }) => {
  const { t } = useTranslation();
  const due =
    request.response_due_at === null ? undefined : formatLagosTime(request.response_due_at);

  return (
    <>
      <p className="flex flex-wrap gap-x-2 text-copy-muted text-label font-medium mb-1">
        <span>{t('actionLink.codeLabel')}</span>
        <span className="whitespace-nowrap text-ink font-semibold tracking-wider tabular-nums">
          {request.code}
        </span>
      </p>
      <h1 className="text-headline-lg font-bold text-ink tracking-tight mb-6 break-words">
        {t('actionLink.title', { facility: request.facility_name })}
      </h1>

      <div className="rounded-xl border-2 border-primary p-5 mb-4">
        <p className="text-copy-muted text-label font-medium">{t('actionLink.payoutLabel')}</p>
        <p className="font-bold text-display text-ink tabular-nums break-words my-1">
          {formatKobo(request.payout_kobo)}
        </p>
        <p className="text-copy-muted text-label">{t('actionLink.payoutHint')}</p>
      </div>

      {due && (
        <div className="mb-4">
          <Notice tone="waiting" title={t('actionLink.answerBy', due)}>
            {t('actionLink.answerByHint')}
          </Notice>
        </div>
      )}

      <Card className="p-5 mb-8">
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-copy-muted text-label">{t('actionLink.produce')}</dt>
            <dd className="text-ink text-body font-medium">
              {t('actionLink.produceValue', {
                produce: request.crop_name,
                amount: formatAmount(request.quantity, request.capacity_unit, t),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-copy-muted text-label">{t('actionLink.dates')}</dt>
            <dd className="text-ink text-body font-medium">
              {t('actionLink.datesValue', {
                start: formatDate(request.start_date),
                end: formatDate(request.end_date),
                count: request.duration_days,
              })}
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
};

interface AnswerButtonsProps {
  pending: ProviderLinkAction | undefined;
  error: unknown;
  onAnswer: (action: ProviderLinkAction) => void;
}

// Rejecting ends the farmer's booking for good, and sits next to Accept on a small screen, so it
// asks once more. Accepting is what the link is for, against a short deadline, so it takes one tap.
const AnswerButtons = ({ pending, error, onAnswer }: AnswerButtonsProps) => {
  const { t } = useTranslation();
  const [confirmingReject, setConfirmingReject] = useState(false);
  const busy = pending !== undefined;

  return (
    <div className="flex flex-col gap-3">
      {error !== null && !busy && <ErrorMessage>{describeApiError(error, t)}</ErrorMessage>}
      {confirmingReject ? (
        <Card className="p-5">
          <p className="text-ink text-body font-semibold mb-4">{t('actionLink.rejectQuestion')}</p>
          <div className="flex flex-col gap-3">
            <DangerButton onClick={() => onAnswer('reject')} disabled={busy}>
              {pending === 'reject' ? t('actionLink.rejecting') : t('actionLink.confirmReject')}
            </DangerButton>
            <TextButton onClick={() => setConfirmingReject(false)} disabled={busy}>
              {t('actionLink.keep')}
            </TextButton>
          </div>
        </Card>
      ) : (
        <>
          <PrimaryButton onClick={() => onAnswer('accept')} disabled={busy}>
            {pending === 'accept' ? t('actionLink.accepting') : t('actionLink.accept')}
          </PrimaryButton>
          <SecondaryButton onClick={() => setConfirmingReject(true)} disabled={busy}>
            {t('actionLink.reject')}
          </SecondaryButton>
        </>
      )}
    </div>
  );
};

const LoadingScreen = () => {
  const { t } = useTranslation();

  return (
    <Screen>
      <div className="flex flex-col gap-4 px-5 pt-6">
        <p role="status" className="text-copy-muted text-label font-medium">
          {t('common.loading')}
        </p>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <div className="h-28 rounded-xl bg-surface-muted" />
          <div className="h-20 rounded-xl bg-surface-muted" />
          <div className="h-36 rounded-xl bg-surface-muted" />
        </div>
      </div>
    </Screen>
  );
};

const ActionLinkScreen = ({ token }: { token: string }) => {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<Outcome>();
  // The query key leaves the token out, so it is never printed with the cache; the screen is
  // remounted for each token instead, and the cache entry dropped when it goes.
  const query = useQuery({
    queryKey: ['actionLink'],
    queryFn: ({ signal }) => fetchActionLink(token, signal),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const inFlight = useRef(false);
  const answer = useMutation({
    mutationFn: (action: ProviderLinkAction) => answerActionLink(token, { action }),
    onSuccess: (result) => setOutcome(result.status),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const onAnswer = (action: ProviderLinkAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    answer.mutate(action);
  };

  if (outcome !== undefined && query.data)
    return <OutcomeScreen outcome={outcome} request={query.data} />;
  if (isFinal(answer.error)) return <FinalError error={answer.error} />;
  if (isFinal(query.error)) return <FinalError error={query.error} />;
  if (query.isError) {
    return (
      <MessageScreen
        icon={isApiError(query.error, 'network') ? WifiOff : CircleAlert}
        title={t('actionLink.failedTitle')}
        body={describeApiError(query.error, t)}
      >
        <PrimaryButton onClick={() => void query.refetch()} disabled={query.isFetching}>
          {t('common.tryAgain')}
        </PrimaryButton>
      </MessageScreen>
    );
  }
  if (!query.data) return <LoadingScreen />;

  return (
    <Screen>
      <div className="flex flex-col px-5 pt-6">
        <RequestFacts request={query.data} />
        <AnswerButtons
          pending={answer.isPending ? answer.variables : undefined}
          error={answer.error}
          onAnswer={onAnswer}
        />
      </div>
    </Screen>
  );
};

/** The no-login page a provider opens from the booking_received SMS (PRD 7.6, decision 108). */
const ActionLink = () => {
  useNoReferrer();
  const { token = '' } = useParams();

  return <ActionLinkScreen key={token} token={token} />;
};

export default ActionLink;
