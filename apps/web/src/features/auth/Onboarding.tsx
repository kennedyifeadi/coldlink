import React, { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { phoneSchema } from '@coldlink/shared';
import logoMain from '../../assets/logo_main.webp';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { labelClasses } from '../../components/ui/inputStyles';
import { requestOtp } from '../../api/auth';
import { describeApiError } from '../../api/describeError';
import { returnToStateSchema } from '../../session/routes';
import { useSignInFlow } from './signInFlow';

const PHONE_ERROR_ID = 'phone-number-error';

const Onboarding = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [invalidPhone, setInvalidPhone] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const flow = useSignInFlow();

  const sendCode = useMutation({
    mutationFn: (phone: string) => requestOtp({ phone }),
    onSuccess: (response, phone) => {
      flow.begin({
        phone,
        resendAfterSeconds: response.resend_after_seconds,
        devCode: response.dev_code,
        returnTo: returnToStateSchema.safeParse(location.state).data?.returnTo,
      });
      void navigate('/onboarding/code');
    },
  });

  const handleContinue = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const phone = phoneSchema.safeParse(phoneNumber);
    setInvalidPhone(!phone.success);
    if (phone.success) sendCode.mutate(phone.data);
  };

  const error = invalidPhone
    ? t('auth.onboarding.invalidPhone')
    : sendCode.isError
      ? describeApiError(sendCode.error, t)
      : undefined;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="px-5 pt-6">
        <img src={logoMain} alt={t('common.logoAlt')} width={164} height={38} />
      </div>

      <div className="px-5 pt-14 pb-6">
        <h1 className="text-display font-bold text-ink tracking-tight mb-3">
          {t('auth.onboarding.title')}
        </h1>
        <p className="text-copy-muted text-lead">{t('auth.onboarding.intro')}</p>
      </div>

      <form onSubmit={handleContinue} noValidate className="w-full px-5 pt-6 pb-8">
        <div className="mb-6">
          <label htmlFor="phone-number" className={labelClasses}>
            {t('auth.onboarding.phoneLabel')}
          </label>
          <div
            className={`flex items-center border rounded-xl overflow-hidden focus-within:ring-4 transition-[border-color,box-shadow] ${
              invalidPhone
                ? 'border-alert focus-within:ring-alert-faint'
                : 'border-line-strong focus-within:border-primary focus-within:ring-primary-soft'
            }`}
          >
            <div className="flex items-center gap-2 px-4 min-h-13 bg-surface-muted border-r border-line-strong shrink-0">
              <div className="flex w-5 h-3.5 rounded-sm overflow-hidden shrink-0 border border-line-strong">
                <div className="w-1/3 h-full bg-flag-green"></div>
                <div className="w-1/3 h-full bg-white"></div>
                <div className="w-1/3 h-full bg-flag-green"></div>
              </div>
              <span className="text-ink font-medium">+234</span>
            </div>

            <input
              id="phone-number"
              type="tel"
              autoComplete="tel-national"
              placeholder={t('auth.onboarding.phonePlaceholder')}
              aria-invalid={invalidPhone}
              aria-describedby={error ? PHONE_ERROR_ID : undefined}
              className="w-full px-4 min-h-13 text-subtitle text-ink bg-surface placeholder:text-copy-subtle focus:outline-none"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setInvalidPhone(false);
                sendCode.reset();
              }}
            />
          </div>
          {error && (
            <div className="mt-2">
              <ErrorMessage id={PHONE_ERROR_ID}>{error}</ErrorMessage>
            </div>
          )}
        </div>

        <PrimaryButton type="submit" disabled={phoneNumber.trim() === '' || sendCode.isPending}>
          {sendCode.isPending ? t('auth.onboarding.sending') : t('common.continue')}
        </PrimaryButton>

        <p className="text-copy-muted text-label mt-6">
          {t('auth.onboarding.footer')}{' '}
          <Link
            to="/privacy"
            className="text-primary-strong font-semibold underline underline-offset-2"
          >
            {t('auth.onboarding.privacyLink')}
          </Link>
        </p>
      </form>
    </div>
  );
};

export default Onboarding;
