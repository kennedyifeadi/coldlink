import React, { startTransition, useState, type FormEvent } from 'react';
import { CalendarCheck, Phone, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import logoMain from '../../assets/logo_main.webp';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { verifyOtp } from '../../api/auth';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { SIGN_IN_PATH } from '../../session/routes';
import { useSignInFlow, type PendingSignIn } from './signInFlow';
import { useCompleteSignIn } from './useCompleteSignIn';

type ConsentPoint = 'phone' | 'bookings' | 'rights';

const points: { key: ConsentPoint; Icon: LucideIcon }[] = [
  { key: 'phone', Icon: Phone },
  { key: 'bookings', Icon: CalendarCheck },
  { key: 'rights', Icon: ShieldCheck },
];

const ConsentForm = ({ pending, code }: { pending: PendingSignIn; code: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const flow = useSignInFlow();
  const completeSignIn = useCompleteSignIn();
  const [agreed, setAgreed] = useState(false);

  const verify = useMutation({
    mutationFn: () => verifyOtp({ phone: pending.phone, code, consent: true }),
    onSuccess: completeSignIn,
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    verify.mutate();
  };

  // In one transition with the navigation, as in useCompleteSignIn, so this screen's redirect
  // for a missing code never runs.
  const getNewCode = () =>
    startTransition(() => {
      flow.update({ code: undefined });
      void navigate('/onboarding/code', { replace: true });
    });

  return (
    <div className="flex flex-col h-full min-h-screen bg-background p-6 relative">
      <div className="flex items-center mt-8 mb-12">
        <img src={logoMain} alt={t('common.logoAlt')} width={190} height={44} />
      </div>

      <div className="mb-auto">
        <h1 className="font-heading text-display font-bold text-ink tracking-tight leading-tight mb-4">
          {t('auth.consent.title')}
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed mb-6">{t('auth.consent.intro')}</p>

        <ul className="flex flex-col gap-4 mb-6">
          {points.map(({ key, Icon }) => (
            <li key={key} className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center text-primary-strong shrink-0">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="text-body text-copy leading-relaxed pt-2">
                {t(`auth.consent.points.${key}`)}
              </span>
            </li>
          ))}
        </ul>

        <Link to="/privacy" className="text-primary-strong font-medium text-lead underline">
          {t('auth.consent.readNotice')}
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="w-full mt-10 pb-8">
        <label className="relative flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`w-6 h-6 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-strong ${
              agreed ? 'bg-primary border-primary-strong' : 'border-line-strong bg-surface'
            }`}
          >
            {agreed && <span className="w-3 h-3 bg-ink rounded-sm"></span>}
          </span>
          <span className="text-body text-copy">{t('auth.consent.agree')}</span>
        </label>

        {verify.isError && (
          <div className="mb-6">
            <ErrorMessage>{describeApiError(verify.error, t)}</ErrorMessage>
          </div>
        )}

        <PrimaryButton type="submit" disabled={!agreed || verify.isPending}>
          {verify.isPending ? t('auth.consent.creating') : t('auth.consent.submit')}
        </PrimaryButton>

        {isApiError(verify.error, 'otp_invalid') && (
          <div className="mt-4">
            <TextButton onClick={getNewCode}>{t('auth.consent.getNewCode')}</TextButton>
          </div>
        )}
      </form>
    </div>
  );
};

const Consent = () => {
  const { pending } = useSignInFlow();
  if (!pending?.code) return <Navigate to={SIGN_IN_PATH} replace />;
  return <ConsentForm pending={pending} code={pending.code} />;
};

export default Consent;
