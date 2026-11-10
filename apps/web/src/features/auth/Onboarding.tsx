import React, { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { phoneSchema } from '@coldlink/shared';
import logoMain from '../../assets/logo_main.webp';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
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
    <div className="flex flex-col h-full min-h-screen bg-background p-6 relative">
      {/* Header / Logo Area */}
      <div className="flex items-center mt-8 mb-16">
        <img src={logoMain} alt={t('common.logoAlt')} width={190} height={44} />
      </div>

      {/* Hero Text */}
      <div className="mb-auto">
        <h1 className="font-heading text-display font-bold text-ink tracking-tight leading-tight mb-4">
          {t('auth.onboarding.title')}
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed">{t('auth.onboarding.intro')}</p>
      </div>

      {/* Form and Action Area */}
      <form onSubmit={handleContinue} noValidate className="w-full mt-12 pb-8">
        {/* Phone Number Input */}
        <div className="mb-8">
          <label htmlFor="phone-number" className="block text-label font-medium text-copy mb-2">
            {t('auth.onboarding.phoneLabel')}
          </label>
          <div
            className={`flex items-center border rounded-lg overflow-hidden focus-within:ring-1 transition-all ${
              invalidPhone
                ? 'border-alert-strong focus-within:ring-alert-strong'
                : 'border-line-strong focus-within:border-primary-strong focus-within:ring-primary-strong'
            }`}
          >
            {/* Country Code & Flag */}
            <div className="flex items-center gap-2 px-4 py-3.5 bg-surface-muted border-r border-line-strong shrink-0">
              {/* CSS Nigerian Flag (No emojis!) */}
              <div className="flex w-5 h-3.5 rounded-sm overflow-hidden shrink-0 border border-line-strong shadow-sm">
                <div className="w-1/3 h-full bg-flag-green"></div>
                <div className="w-1/3 h-full bg-white"></div>
                <div className="w-1/3 h-full bg-flag-green"></div>
              </div>
              <span className="text-copy font-medium">+234</span>
            </div>

            {/* Input Field */}
            <input
              id="phone-number"
              type="tel"
              autoComplete="tel-national"
              placeholder={t('auth.onboarding.phonePlaceholder')}
              aria-invalid={invalidPhone}
              aria-describedby={error ? PHONE_ERROR_ID : undefined}
              className="w-full px-4 py-3.5 text-subtitle text-copy bg-surface placeholder-copy-subtle focus:outline-none"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setInvalidPhone(false);
                sendCode.reset();
              }}
            />
          </div>
          {error && (
            <div className="mt-3">
              <ErrorMessage id={PHONE_ERROR_ID}>{error}</ErrorMessage>
            </div>
          )}
        </div>

        {/* Continue Button */}
        <PrimaryButton
          type="submit"
          disabled={phoneNumber.trim() === '' || sendCode.isPending}
          withArrow
        >
          {sendCode.isPending ? t('auth.onboarding.sending') : t('common.continue')}
        </PrimaryButton>

        {/* Footer Text */}
        <p className="text-center text-copy-muted text-body mt-8 px-4 leading-relaxed">
          {t('auth.onboarding.footer')}{' '}
          <Link to="/privacy" className="text-primary-strong font-medium underline">
            {t('auth.onboarding.privacyLink')}
          </Link>
        </p>
      </form>
    </div>
  );
};

export default Onboarding;
