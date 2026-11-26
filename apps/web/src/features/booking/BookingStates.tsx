import React from 'react';
import { CircleAlert, SearchX, WifiOff } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CapacityUnit } from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import TopNavBar from '../../components/TopNavBar';
import Notice from '../../components/ui/Notice';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import StepProgress from '../../components/ui/StepProgress';
import { MY_BOOKINGS_PATH } from '../../session/routes';
import {
  readDraft,
  SEARCH_STEPS,
  useSearchFlow,
  type SearchNoticeState,
} from '../search/searchFlow';
import { formatAmount } from '../search/units';
import type { QuoteProblem } from './useBooking';

const STEP_NUMBERS = { details: 1, review: 2, pay: 3 } as const;

export const BookingProgress = ({ step }: { step: keyof typeof STEP_NUMBERS }) => {
  const { t } = useTranslation();
  const count = Object.keys(STEP_NUMBERS).length;
  const number = STEP_NUMBERS[step];

  return (
    <StepProgress
      step={number}
      count={count}
      label={t('booking.step', { step: number, count, name: t(`booking.steps.${step}`) })}
    />
  );
};

/** A booking URL that was cut short or edited: back to search, saying why. */
export const BrokenBookingLink = () => (
  <Navigate
    to={SEARCH_STEPS.place}
    replace
    state={{ notice: 'bookingLinkBroken' } satisfies SearchNoticeState}
  />
);

interface ProblemScreenProps {
  navTitle: string;
  icon: typeof SearchX;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  busy?: boolean;
  secondary?: { label: string; onClick: () => void };
}

export const ProblemScreen = ({
  navTitle,
  icon: Icon,
  title,
  body,
  action,
  onAction,
  busy = false,
  secondary,
}: ProblemScreenProps) => (
  <div className="flex flex-col min-h-screen bg-background pb-8">
    <TopNavBar title={navTitle} showBack={true} />
    <div className="px-5 pt-12 pb-6 rim mb-auto">
      <Icon size={28} className="text-copy-muted mb-4" aria-hidden="true" />
      <h1 className="text-headline font-bold text-ink mb-2">{title}</h1>
      <p className="text-copy-muted text-body">{body}</p>
    </div>
    <div className="mt-12 px-5 flex flex-col gap-3">
      <PrimaryButton onClick={onAction} disabled={busy}>
        {action}
      </PrimaryButton>
      {secondary && (
        <TextButton onClick={secondary.onClick} disabled={busy}>
          {secondary.label}
        </TextButton>
      )}
    </div>
  </div>
);

export const FacilityGone = ({ navTitle }: { navTitle: string }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const searchDone = 'body' in readDraft(useSearchFlow().draft);

  return (
    <ProblemScreen
      navTitle={navTitle}
      icon={SearchX}
      title={t('booking.problems.goneTitle')}
      body={t('booking.problems.goneBody')}
      action={t('booking.problems.findAnother')}
      onAction={() => void navigate(searchDone ? SEARCH_STEPS.results : SEARCH_STEPS.place)}
    />
  );
};

/** A booking id that is malformed, unknown or someone else's: the API's one 404. */
export const BookingNotFound = ({ navTitle }: { navTitle: string }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={navTitle}
      icon={SearchX}
      title={t('booking.confirmation.notFoundTitle')}
      body={t('booking.confirmation.notFoundBody')}
      action={t('booking.paymentReturn.goToBookings')}
      onAction={() => void navigate(MY_BOOKINGS_PATH, { replace: true })}
    />
  );
};

export const BookingSkeleton = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 px-5 pt-6">
      <p role="status" className="text-copy-muted text-label font-medium">
        {t('common.loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-24 rounded-xl bg-surface-muted" />
        <div className="h-36 rounded-xl bg-surface-muted" />
        <div className="h-64 rounded-xl bg-surface-muted" />
      </div>
    </div>
  );
};

interface LoadFailedProps {
  navTitle: string;
  title?: string;
  error: unknown;
  retry: () => void;
  retrying: boolean;
}

export const LoadFailed = ({ navTitle, title, error, retry, retrying }: LoadFailedProps) => {
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={navTitle}
      icon={isApiError(error, 'network') ? WifiOff : CircleAlert}
      title={title ?? t('booking.problems.failedTitle')}
      body={describeApiError(error, t)}
      action={t('common.tryAgain')}
      onAction={retry}
      busy={retrying}
    />
  );
};

interface QuoteProblemNoticeProps {
  problem: QuoteProblem;
  asked: { quantity: number; unit: CapacityUnit };
}

/** Why these terms can't be booked here; the screen's main action is then to change them. */
export const QuoteProblemNotice = ({ problem, asked }: QuoteProblemNoticeProps) => {
  const { t } = useTranslation();
  const isSpace = problem.kind === 'notEnoughSpace';
  const title = !isSpace
    ? t('booking.problems.invalidTermsTitle')
    : problem.available === 0
      ? t('booking.problems.noSpaceTitle')
      : t('booking.problems.notEnoughSpaceTitle', {
          free: formatAmount(problem.available, asked.unit, t),
        });
  const body = isSpace
    ? t('booking.problems.notEnoughSpaceBody', {
        asked: formatAmount(asked.quantity, asked.unit, t),
      })
    : problem.message;

  return (
    <Notice tone="error" role="alert" title={title}>
      {body}
    </Notice>
  );
};
