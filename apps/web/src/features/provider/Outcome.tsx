import React from 'react';
import { CircleCheck, Clock } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import Card from '../../components/ui/Card';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import { formatKobo } from '../../i18n/format';
import { formatAmount } from '../search/units';
import { PROVIDER_ONBOARDING_PATH } from '../../session/routes';
import { useOnboardingFlow } from './onboardingFlow';
import VerificationBadge from './VerificationBadge';

const NEXT_STEPS = {
  live: ['liveNext1', 'liveNext2'],
  pending: ['pendingNext1', 'pendingNext2'],
} as const;

/** After the last step: whether the facility waits for an admin or is already live (decision 62). */
const Outcome = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const flow = useOnboardingFlow();
  const provider = flow.draft.created;

  if (!provider) return <Navigate to={PROVIDER_ONBOARDING_PATH} replace />;

  const live = provider.verification_status === 'approved';
  const outcome = live ? 'live' : 'pending';
  const Icon = live ? CircleCheck : Clock;

  // The listing is done, so the next visit to the wizard starts a new one.
  const leave = (path: string) => {
    void navigate(path, { replace: true });
    flow.reset();
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNavBar title={t('provider.onboarding.navTitle')} />

      <div className="px-5 pt-8 pb-5 rim">
        <Icon
          size={32}
          className={`mb-3 ${live ? 'text-primary-strong' : 'text-accent-ink'}`}
          aria-hidden="true"
        />
        <h1 className="text-headline-lg font-bold text-ink tracking-tight mb-1">
          {t(`provider.outcome.${outcome}.title`)}
        </h1>
        <p className="text-copy-muted text-body">
          {t(`provider.outcome.${outcome}.intro`, { name: provider.display_name })}
        </p>
      </div>

      <div className="flex flex-col px-5 pt-6 pb-48">
        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold text-ink text-subtitle">{provider.display_name}</h2>
            <VerificationBadge status={provider.verification_status} />
          </div>
          <p className="text-copy-muted text-label">{provider.address_text}</p>
          <p className="text-ink text-body mt-2">
            {t('provider.outcome.summary', {
              capacity: formatAmount(provider.capacity_total, provider.capacity_unit, t),
              price: formatKobo(provider.price_per_unit_per_day_kobo),
              unit: t(`provider.capacity.perUnit.${provider.capacity_unit}`),
            })}
          </p>
        </Card>

        <h2 className="font-semibold text-ink text-subtitle mb-3">
          {t('provider.outcome.nextTitle')}
        </h2>
        <ul className="flex flex-col gap-2 list-disc pl-5 text-ink text-body marker:text-primary">
          {NEXT_STEPS[outcome].map((key) => (
            <li key={key}>{t(`provider.outcome.${key}`)}</li>
          ))}
        </ul>
      </div>

      <BottomActionBar>
        <div className="flex flex-col gap-3">
          <PrimaryButton onClick={() => leave(PROVIDER_ONBOARDING_PATH)}>
            {t('provider.outcome.seeFacilities')}
          </PrimaryButton>
          <TextButton onClick={() => leave('/')}>{t('provider.outcome.home')}</TextButton>
        </div>
      </BottomActionBar>
    </div>
  );
};

export default Outcome;
