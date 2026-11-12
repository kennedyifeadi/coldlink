import React from 'react';
import { CircleAlert, SearchX, WifiOff } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CapacityUnit } from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import PrimaryButton from '../../components/ui/PrimaryButton';
import StepProgress from '../../components/ui/StepProgress';
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
}

const ProblemScreen = ({
  navTitle,
  icon: Icon,
  title,
  body,
  action,
  onAction,
  busy = false,
}: ProblemScreenProps) => (
  <div className="flex flex-col h-full min-h-screen bg-background pb-8">
    <TopNavBar title={navTitle} showBack={true} />
    <div className="flex flex-col items-center text-center px-6 pt-16 mb-auto">
      <div className="w-20 h-20 mb-8 bg-surface-muted rounded-full flex items-center justify-center text-primary-strong">
        <Icon size={32} aria-hidden="true" />
      </div>
      <h1 className="font-heading text-headline font-bold text-ink mb-3">{title}</h1>
      <p className="text-copy-muted text-lead leading-relaxed max-w-sm">{body}</p>
    </div>
    <div className="mt-12 px-6">
      <PrimaryButton onClick={onAction} disabled={busy}>
        {action}
      </PrimaryButton>
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

interface LoadFailedProps {
  navTitle: string;
  error: unknown;
  retry: () => void;
  retrying: boolean;
}

export const LoadFailed = ({ navTitle, error, retry, retrying }: LoadFailedProps) => {
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={navTitle}
      icon={isApiError(error, 'network') ? WifiOff : CircleAlert}
      title={t('booking.problems.failedTitle')}
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
    <Card tone="muted" className="p-5">
      <div role="alert" className="flex items-start gap-3">
        <CircleAlert size={22} className="text-alert-strong shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h2 className="font-heading font-semibold text-ink text-subtitle mb-1">{title}</h2>
          <p className="text-copy text-body leading-relaxed">{body}</p>
        </div>
      </div>
    </Card>
  );
};
