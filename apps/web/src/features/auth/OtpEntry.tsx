import React, { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import logoMain from '../../assets/logo_main.webp';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { requestOtp, verifyOtp } from '../../api/auth';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { SIGN_IN_PATH } from '../../session/routes';
import { useSignInFlow, type PendingSignIn } from './signInFlow';
import { useCountdown } from './useCountdown';
import { useCompleteSignIn } from './useCompleteSignIn';
import { formatClock, formatPhoneForDisplay } from './phoneDisplay';
import DevCodeHint from './DevCodeHint';

const CODE_LENGTH = 6;
const CODE_ERROR_ID = 'otp-code-error';

interface CodeSlotsProps {
  code: string;
  focused: boolean;
  invalid: boolean;
}

const slotBorders = {
  invalid: 'border-alert-strong',
  active: 'border-primary-strong ring-1 ring-primary-strong',
  idle: 'border-line-strong',
};

// The digits are drawn in six boxes; the real input sits on top, invisible, so typing, pasting
// and SMS autofill all go through one ordinary field.
const CodeSlots = ({ code, focused, invalid }: CodeSlotsProps) => {
  const activeSlot = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <div aria-hidden="true" className="grid grid-cols-6 gap-2">
      {Array.from({ length: CODE_LENGTH }, (_, slot) => {
        const active = focused && slot === activeSlot;
        const border = invalid
          ? slotBorders.invalid
          : active
            ? slotBorders.active
            : slotBorders.idle;
        return (
          <div
            key={slot}
            className={`h-14 flex items-center justify-center rounded-lg border bg-surface text-headline font-bold text-ink tabular-nums transition-colors ${border}`}
          >
            {code[slot] ?? (active ? <span className="w-0.5 h-6 bg-primary-strong" /> : '')}
          </div>
        );
      })}
    </div>
  );
};

const OtpEntryForm = ({ pending }: { pending: PendingSignIn }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const flow = useSignInFlow();
  const completeSignIn = useCompleteSignIn();
  const countdown = useCountdown(pending.resendAfterSeconds);
  const [code, setCode] = useState(pending.code ?? '');
  const [focused, setFocused] = useState(false);

  const verify = useMutation({
    mutationFn: (enteredCode: string) => verifyOtp({ phone: pending.phone, code: enteredCode }),
    onSuccess: completeSignIn,
    onError: (error, enteredCode) => {
      // The code is still good: consent_required does not use it up (decision 54).
      if (isApiError(error, 'consent_required')) {
        flow.update({ code: enteredCode });
        void navigate('/onboarding/consent');
      }
    },
  });

  const resend = useMutation({
    mutationFn: () => requestOtp({ phone: pending.phone }),
    onMutate: () => verify.reset(),
    onSuccess: (response) => {
      countdown.restart(response.resend_after_seconds);
      flow.update({ devCode: response.dev_code, code: undefined });
      setCode('');
    },
    onError: (error) => {
      if (isApiError(error, 'rate_limited') && error.retryAfterSeconds !== undefined) {
        countdown.restart(error.retryAfterSeconds);
      }
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    resend.reset();
    verify.mutate(code);
  };

  const failure = resend.isError
    ? resend.error
    : verify.isError && !isApiError(verify.error, 'consent_required')
      ? verify.error
      : undefined;
  const phone = formatPhoneForDisplay(pending.phone);

  return (
    <div className="flex flex-col h-full min-h-screen bg-background p-6 relative">
      <div className="flex items-center mt-8 mb-16">
        <img src={logoMain} alt={t('common.logoAlt')} width={190} height={44} />
      </div>

      <div className="mb-auto">
        <h1 className="font-heading text-display font-bold text-ink tracking-tight leading-tight mb-4">
          {t('auth.otp.title')}
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed">
          {t('auth.otp.intro', { phone })}
        </p>
        <Link
          to={SIGN_IN_PATH}
          className="inline-block mt-2 py-2 text-primary-strong font-medium text-lead underline"
        >
          {t('auth.otp.changeNumber')}
        </Link>
      </div>

      <form onSubmit={handleSubmit} noValidate className="w-full mt-12 pb-8">
        {import.meta.env.DEV && pending.devCode && (
          <DevCodeHint code={pending.devCode} onUse={setCode} />
        )}

        <div className="mb-8">
          <label htmlFor="otp-code" className="block text-label font-medium text-copy mb-2">
            {t('auth.otp.codeLabel')}
          </label>
          <div className="relative">
            <CodeSlots code={code} focused={focused} invalid={failure !== undefined} />
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              aria-invalid={failure !== undefined}
              aria-describedby={failure ? CODE_ERROR_ID : undefined}
              className="absolute inset-0 w-full h-full opacity-0 cursor-text"
              value={code}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH));
                verify.reset();
              }}
            />
          </div>
          {failure !== undefined && (
            <div className="mt-3">
              <ErrorMessage id={CODE_ERROR_ID}>{describeApiError(failure, t)}</ErrorMessage>
            </div>
          )}
          {resend.isSuccess && (
            <p role="status" className="mt-3 text-body text-copy-muted">
              {t('auth.otp.resent', { phone })}
            </p>
          )}
        </div>

        <PrimaryButton
          type="submit"
          disabled={code.length < CODE_LENGTH || verify.isPending}
          withArrow
        >
          {verify.isPending ? t('auth.otp.checking') : t('common.continue')}
        </PrimaryButton>

        <div className="mt-4">
          <TextButton
            onClick={() => resend.mutate()}
            disabled={countdown.remaining > 0 || resend.isPending}
          >
            {countdown.remaining > 0
              ? t('auth.otp.resendIn', { time: formatClock(countdown.remaining) })
              : t('auth.otp.resend')}
          </TextButton>
        </div>
      </form>
    </div>
  );
};

const OtpEntry = () => {
  const { pending } = useSignInFlow();
  if (!pending) return <Navigate to={SIGN_IN_PATH} replace />;
  return <OtpEntryForm pending={pending} />;
};

export default OtpEntry;
