import React, { useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleX, Hourglass, PackageCheck, Phone, WifiOff } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  handoverCodeSchema,
  type PartnerDeliveryActionBody,
  type PartnerDeliveryJob,
  type PartnerDeliveryLinkKind,
} from '@coldlink/shared';
import {
  actOnDeliveryLink,
  fetchDeliveryLink,
  handoverAttemptsLeftAfter,
} from '../../api/deliveryLinks';
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
import { formatDate, formatKobo, formatNumber } from '../../i18n/format';
import { formatPhoneForDisplay } from '../auth/phoneDisplay';
import { useNoReferrer } from '../providerLink/useNoReferrer';
import { formatAmount } from '../search/units';

type Action = PartnerDeliveryActionBody['action'];

const CODE_LENGTH = 4;
const CODE_ERROR_ID = 'handover-code-error';

const Screen = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      <TopNavBar title={t('deliveryLink.navTitle')} />
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
    {children && <div className="px-5 mt-4 flex flex-col gap-3">{children}</div>}
  </Screen>
);

/** One screen for a link that cannot be used here: never says which links exist. */
const FinalError = ({ error }: { error: unknown }) => {
  const { t } = useTranslation();

  if (isApiError(error, 'rate_limited')) {
    const seconds = error.retryAfterSeconds;
    return (
      <MessageScreen
        icon={Hourglass}
        title={t('deliveryLink.rateLimitedTitle')}
        body={
          seconds === undefined
            ? t('deliveryLink.rateLimitedBody')
            : t('deliveryLink.rateLimitedWait', { wait: formatWait(seconds, t) })
        }
      />
    );
  }
  return (
    <MessageScreen
      icon={CircleAlert}
      title={t('deliveryLink.goneTitle')}
      body={t('deliveryLink.goneBody')}
    />
  );
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-copy-muted text-label">{label}</dt>
    <dd className="text-ink text-body font-medium break-words">{children}</dd>
  </div>
);

/** The facility's end and the farmer's, in the order the driver travels them. */
const Route = ({ job }: { job: PartnerDeliveryJob }) => {
  const { t } = useTranslation();
  const facility = [job.facility.name, job.facility.address ?? job.facility.lga]
    .filter((part) => part !== null && part !== '')
    .join(', ');
  const farmer =
    job.farmer_address ??
    t('deliveryLink.farmerEndHidden', { distance: formatNumber(job.distance_km) });
  const [from, to] = job.direction === 'inbound' ? [farmer, facility] : [facility, farmer];

  return (
    <>
      <Fact label={t('deliveryLink.from')}>{from}</Fact>
      <Fact label={t('deliveryLink.to')}>{to}</Fact>
    </>
  );
};

const JobFacts = ({ job }: { job: PartnerDeliveryJob }) => {
  const { t } = useTranslation();

  return (
    <>
      <p className="flex flex-wrap gap-x-2 text-copy-muted text-label font-medium mb-1">
        <span>{t('deliveryLink.bookingLabel')}</span>
        <span className="whitespace-nowrap text-ink font-semibold tracking-wider tabular-nums">
          {job.booking_code}
        </span>
      </p>
      <h1 className="text-headline-lg font-bold text-ink tracking-tight mb-6 break-words">
        {t('deliveryLink.title', { date: formatDate(job.scheduled_for) })}
      </h1>

      <div className="rounded-xl border-2 border-primary p-5 mb-4">
        <p className="text-copy-muted text-label font-medium">{t('deliveryLink.payoutLabel')}</p>
        <p className="font-bold text-display text-ink tabular-nums break-words my-1">
          {formatKobo(job.payout_kobo)}
        </p>
        <p className="text-copy-muted text-label">{t('deliveryLink.payoutHint')}</p>
      </div>

      <Card className="p-5 mb-4">
        <dl className="flex flex-col gap-4">
          <Route job={job} />
          <Fact label={t('deliveryLink.load')}>
            {t('deliveryLink.loadValue', {
              description: job.load_description,
              amount: formatAmount(job.load_quantity, job.load_unit, t),
            })}
          </Fact>
          <Fact label={t('deliveryLink.vehicle')}>
            {t(`deliveryLink.vehicles.${job.vehicle_type}`)}
          </Fact>
          <Fact label={t('deliveryLink.distance')}>
            {t('deliveryLink.distanceValue', { distance: formatNumber(job.distance_km) })}
          </Fact>
        </dl>
      </Card>

      {job.contact && (
        <Card className="p-5 mb-8">
          <p className="text-copy-muted text-label">{t('deliveryLink.contact')}</p>
          <p className="text-ink text-body font-medium mb-3">
            {job.contact.name ?? t('deliveryLink.contactUnnamed')}
          </p>
          {/* A phone call, not a page: it sends no Referer and carries no token. */}
          <a
            href={`tel:${job.contact.phone}`}
            className="inline-flex items-center gap-2 text-primary-strong font-semibold text-body"
          >
            <Phone size={18} aria-hidden="true" />
            {t('deliveryLink.call', { phone: formatPhoneForDisplay(job.contact.phone) })}
          </a>
        </Card>
      )}
    </>
  );
};

interface StepProps {
  pending: Action | undefined;
  error: unknown;
  onAct: (body: PartnerDeliveryActionBody) => void;
}

/**
 * The error under a step's button; a dropped connection turns the button into Try again. A wrong
 * code is shown by its field, and a conflict by reading the job again, so neither shows here.
 */
const StepError = ({ error, busy }: { error: unknown; busy: boolean }) => {
  const { t } = useTranslation();
  if (error === null || busy) return null;
  if (isApiError(error, 'handover_code_invalid') || isApiError(error, 'conflict')) return null;
  return <ErrorMessage>{describeApiError(error, t)}</ErrorMessage>;
};

/** Try again after a dropped connection, so the partner knows the last tap never arrived. */
const useButtonLabel = (error: unknown) => {
  const { t } = useTranslation();
  const tryAgain = t('common.tryAgain');
  return (label: string) => (isApiError(error, 'network') ? tryAgain : label);
};

// Declining hands the job back to ColdLink and sits next to Accept, so it asks once more.
const AnswerStep = ({ pending, error, onAct }: StepProps) => {
  const { t } = useTranslation();
  const label = useButtonLabel(error);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const busy = pending !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <StepError error={error} busy={busy} />
      {confirmingDecline ? (
        <Card className="p-5">
          <p className="text-ink text-body font-semibold mb-4">
            {t('deliveryLink.declineQuestion')}
          </p>
          <div className="flex flex-col gap-3">
            <DangerButton onClick={() => onAct({ action: 'decline' })} disabled={busy}>
              {pending === 'decline'
                ? t('deliveryLink.declining')
                : label(t('deliveryLink.confirmDecline'))}
            </DangerButton>
            <TextButton onClick={() => setConfirmingDecline(false)} disabled={busy}>
              {t('deliveryLink.keep')}
            </TextButton>
          </div>
        </Card>
      ) : (
        <>
          <PrimaryButton onClick={() => onAct({ action: 'accept' })} disabled={busy}>
            {pending === 'accept' ? t('deliveryLink.accepting') : label(t('deliveryLink.accept'))}
          </PrimaryButton>
          <SecondaryButton onClick={() => setConfirmingDecline(true)} disabled={busy}>
            {t('deliveryLink.decline')}
          </SecondaryButton>
        </>
      )}
    </div>
  );
};

const PickupStep = ({ pending, error, onAct }: StepProps) => {
  const { t } = useTranslation();
  const label = useButtonLabel(error);
  const busy = pending !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <StepError error={error} busy={busy} />
      <PrimaryButton onClick={() => onAct({ action: 'picked_up' })} disabled={busy}>
        {busy ? t('deliveryLink.saving') : label(t('deliveryLink.pickedUp'))}
      </PrimaryButton>
    </div>
  );
};

interface HandoverStepProps extends StepProps {
  attemptsLeft: number;
  code: string;
  onCodeChange: (code: string) => void;
}

const HandoverStep = ({
  pending,
  error,
  onAct,
  attemptsLeft,
  code,
  onCodeChange,
}: HandoverStepProps) => {
  const { t } = useTranslation();
  const label = useButtonLabel(error);
  const [missing, setMissing] = useState(false);
  const busy = pending !== undefined;
  const wrong = isApiError(error, 'handover_code_invalid') && !busy;

  if (attemptsLeft === 0) {
    return (
      <Notice tone="error" role="alert" title={t('deliveryLink.lockedTitle')}>
        {t('deliveryLink.lockedBody')}
      </Notice>
    );
  }

  const submit = () => {
    if (!handoverCodeSchema.safeParse(code).success) {
      setMissing(true);
      return;
    }
    onAct({ action: 'delivered', handover_code: code });
  };
  const message = missing
    ? t('deliveryLink.codeMissing')
    : wrong
      ? t('deliveryLink.codeWrong', { count: attemptsLeft })
      : undefined;

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="handover-code" className="text-ink text-body font-semibold">
        {t('deliveryLink.codeLabel')}
      </label>
      <p className="text-copy-muted text-label -mt-2">{t('deliveryLink.codeHint')}</p>
      <input
        id="handover-code"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={CODE_LENGTH}
        aria-invalid={message !== undefined}
        aria-describedby={message === undefined ? undefined : CODE_ERROR_ID}
        className={`w-full min-h-16 rounded-xl border bg-surface text-center text-display font-bold tabular-nums tracking-[0.5em] text-ink outline-none focus:ring-4 ${
          message === undefined
            ? 'border-line-strong focus:border-primary focus:ring-primary-soft'
            : 'border-alert focus:ring-alert-faint'
        }`}
        value={code}
        disabled={busy}
        onChange={(event) => {
          setMissing(false);
          onCodeChange(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH));
        }}
      />
      {message !== undefined && (
        <p id={CODE_ERROR_ID} role="alert" className="text-alert-strong text-label font-medium">
          {message}
        </p>
      )}
      <StepError error={error} busy={busy} />
      <PrimaryButton type="submit" disabled={busy}>
        {busy ? t('deliveryLink.saving') : label(t('deliveryLink.delivered'))}
      </PrimaryButton>
    </form>
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

/** A job this link can no longer move: cancelled, failed, or otherwise past its step. */
const MovedOn = ({ job }: { job: PartnerDeliveryJob }) => {
  const { t } = useTranslation();
  if (job.status === 'cancelled' || job.status === 'failed') {
    return (
      <MessageScreen
        icon={CircleX}
        title={t(`deliveryLink.${job.status}Title`)}
        body={t(`deliveryLink.${job.status}Body`, { code: job.booking_code })}
      />
    );
  }
  return (
    <MessageScreen
      icon={CircleAlert}
      title={t('deliveryLink.movedOnTitle')}
      body={t('deliveryLink.movedOnBody')}
    />
  );
};

/** Which step a link shows for a status; undefined when the link has nothing left to do. */
const stepFor = (link: PartnerDeliveryLinkKind, job: PartnerDeliveryJob) => {
  if (link === 'accept') return job.status === 'assigned' ? 'answer' : undefined;
  if (job.status === 'accepted') return 'pickup';
  if (job.status === 'picked_up') return 'handover';
  return undefined;
};

type Finished = { outcome: 'declined' } | { outcome: 'delivered'; job: PartnerDeliveryJob };

const DeliveryLinkScreen = ({ token }: { token: string }) => {
  const { t } = useTranslation();
  // The query key leaves the token out, so it is never printed with the cache; the screen is
  // remounted for each token instead, and the cache entry dropped when it goes.
  const query = useQuery({
    queryKey: ['deliveryLink'],
    queryFn: ({ signal }) => fetchDeliveryLink(token, signal),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // After a move the answer's job is the truth: an accept link is spent once used, so it cannot
  // be read again.
  const [moved, setMoved] = useState<{ link: PartnerDeliveryLinkKind; job: PartnerDeliveryJob }>();
  const [justAccepted, setJustAccepted] = useState(false);
  const [finished, setFinished] = useState<Finished>();
  const [code, setCode] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number>();
  const inFlight = useRef(false);
  const act = useMutation({
    mutationFn: (body: PartnerDeliveryActionBody) => actOnDeliveryLink(token, body),
    onSuccess: (result) => {
      if (result.outcome === 'declined' || result.job === null) {
        setFinished({ outcome: 'declined' });
      } else if (result.outcome === 'delivered') {
        setFinished({ outcome: 'delivered', job: result.job });
      } else {
        setJustAccepted(result.outcome === 'accepted');
        setMoved({ link: result.outcome === 'accepted' ? 'accept' : 'update', job: result.job });
      }
    },
    onError: (error) => {
      const left = handoverAttemptsLeftAfter(error);
      if (left !== undefined) {
        setAttemptsLeft(left);
        setCode('');
      }
      // The job moved on elsewhere (cancelled, reassigned, already marked): read it again.
      if (isApiError(error, 'conflict')) {
        setMoved(undefined);
        void query.refetch();
      }
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const onAct = (body: PartnerDeliveryActionBody) => {
    if (inFlight.current) return;
    inFlight.current = true;
    act.mutate(body);
  };

  if (finished?.outcome === 'declined') {
    return (
      <MessageScreen
        icon={CircleX}
        title={t('deliveryLink.declinedTitle')}
        body={t('deliveryLink.declinedBody')}
      />
    );
  }
  if (finished?.outcome === 'delivered') {
    return (
      <MessageScreen
        icon={PackageCheck}
        title={t('deliveryLink.deliveredTitle')}
        body={t('deliveryLink.deliveredBody', { amount: formatKobo(finished.job.payout_kobo) })}
      />
    );
  }
  if (isApiError(act.error, 'not_found') || isApiError(act.error, 'rate_limited')) {
    return <FinalError error={act.error} />;
  }
  if (isApiError(query.error, 'not_found') || isApiError(query.error, 'rate_limited')) {
    return <FinalError error={query.error} />;
  }
  const current = moved ?? query.data;
  if (query.isError && current === undefined) {
    return (
      <MessageScreen
        icon={isApiError(query.error, 'network') ? WifiOff : CircleAlert}
        title={t('deliveryLink.loadFailedTitle')}
        body={describeApiError(query.error, t)}
      >
        <PrimaryButton onClick={() => void query.refetch()} disabled={query.isFetching}>
          {t('common.tryAgain')}
        </PrimaryButton>
      </MessageScreen>
    );
  }
  if (current === undefined || (query.isFetching && moved === undefined)) return <LoadingScreen />;

  const { job } = current;
  if (justAccepted) {
    return (
      <Screen>
        <div className="flex flex-col px-5 pt-6 gap-4">
          <Notice tone="done" title={t('deliveryLink.acceptedTitle')}>
            {t('deliveryLink.acceptedBody')}
          </Notice>
          <div>
            <JobFacts job={job} />
          </div>
        </div>
      </Screen>
    );
  }

  const step = stepFor(current.link, job);
  if (step === undefined) return <MovedOn job={job} />;
  const stepProps: StepProps = {
    pending: act.isPending ? act.variables.action : undefined,
    error: act.error,
    onAct,
  };

  return (
    <Screen>
      <div className="flex flex-col px-5 pt-6">
        <JobFacts job={job} />
        {step === 'answer' && <AnswerStep {...stepProps} />}
        {step === 'pickup' && <PickupStep {...stepProps} />}
        {step === 'handover' && (
          <HandoverStep
            {...stepProps}
            attemptsLeft={attemptsLeft ?? job.handover_attempts_left}
            code={code}
            onCodeChange={setCode}
          />
        )}
      </div>
    </Screen>
  );
};

/** The no-login page a delivery partner opens from an SMS (PRD 7.7 step 5, decision 155). */
const DeliveryLink = () => {
  useNoReferrer();
  const { token = '' } = useParams();

  return <DeliveryLinkScreen key={token} token={token} />;
};

export default DeliveryLink;
