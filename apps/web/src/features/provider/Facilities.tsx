import React from 'react';
import { MapPin } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { OwnProvider } from '@coldlink/shared';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import Card from '../../components/ui/Card';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import { describeApiError } from '../../api/describeError';
import { ownProvidersQuery } from '../../api/providers';
import { useSessionStore } from '../../session/sessionContext';
import { facilityTypeIcons } from '../search/facilityTypeIcons';
import {
  ONBOARDING_STEPS,
  firstUnfinishedStep,
  useOnboardingFlow,
  type OnboardingDraft,
} from './onboardingFlow';
import VerificationBadge from './VerificationBadge';

/** Where the wizard picks up: photos once the facility exists, else the first step not done. */
const resumePath = (draft: OnboardingDraft) =>
  draft.created
    ? ONBOARDING_STEPS.photos
    : ONBOARDING_STEPS[firstUnfinishedStep(draft) ?? 'produce'];

const FacilityCard = ({ provider }: { provider: OwnProvider }) => {
  const { t } = useTranslation();
  const TypeIcon = facilityTypeIcons[provider.facility_type];

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-primary-soft text-primary-strong flex items-center justify-center shrink-0">
          <TypeIcon size={24} aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-grow">
          <h2 className="font-heading font-semibold text-ink text-subtitle leading-snug">
            {provider.display_name}
          </h2>
          <p className="text-copy-muted text-body">
            {t(`search.facilityTypes.${provider.facility_type}`)}
          </p>
          <p className="flex items-start gap-1.5 text-copy text-body">
            <MapPin size={16} aria-hidden="true" className="shrink-0 mt-1 text-copy-subtle" />
            <span>
              {provider.lga ? `${provider.address_text}, ${provider.lga}` : provider.address_text}
            </span>
          </p>
          <div className="mt-2">
            <VerificationBadge status={provider.verification_status} />
          </div>
        </div>
      </div>
    </Card>
  );
};

const FacilitiesSkeleton = () => (
  <div aria-hidden="true" className="flex flex-col gap-4">
    {Array.from({ length: 2 }, (_, index) => (
      <div key={index} className="h-36 rounded-2xl bg-surface-muted" />
    ))}
  </div>
);

/**
 * The way into onboarding. A user with no facility goes straight to the wizard; one who has
 * facilities sees them here and can list another (the full dashboard is #38).
 */
const Facilities = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useSessionStore();
  const flow = useOnboardingFlow();
  const facilities = useQuery(ownProvidersQuery(store.authorizedRequest));

  // Only on a fresh answer: a cached empty list may be from before a facility was created.
  if (facilities.isSuccess && !facilities.isFetching && facilities.data.length === 0) {
    return <Navigate to={resumePath(flow.draft)} replace />;
  }

  const listAnother = () => {
    if (flow.draft.created) flow.reset();
    void navigate(flow.draft.created ? ONBOARDING_STEPS.contact : resumePath(flow.draft));
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative">
      <TopNavBar title={t('provider.facilities.navTitle')} showBack={true} />

      <div className="flex flex-col gap-6 px-6 pt-8 pb-32 flex-grow">
        <div>
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-3 leading-tight tracking-tight">
            {t('provider.facilities.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">
            {t('provider.facilities.intro')}
          </p>
        </div>

        {(facilities.isPending || (facilities.isFetching && facilities.data?.length === 0)) && (
          <>
            <p role="status" className="sr-only">
              {t('provider.facilities.loading')}
            </p>
            <FacilitiesSkeleton />
          </>
        )}

        {facilities.isError && (
          <div className="flex flex-col gap-3">
            <ErrorMessage>{describeApiError(facilities.error, t)}</ErrorMessage>
            <TextButton onClick={() => void facilities.refetch()} disabled={facilities.isFetching}>
              {t('common.tryAgain')}
            </TextButton>
          </div>
        )}

        {facilities.isSuccess && facilities.data.length > 0 && (
          <ul className="flex flex-col gap-4">
            {facilities.data.map((provider) => (
              <li key={provider.id}>
                <FacilityCard provider={provider} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {facilities.isSuccess && facilities.data.length > 0 && (
        <BottomActionBar>
          <PrimaryButton onClick={listAnother} withArrow>
            {t('provider.facilities.listAnother')}
          </PrimaryButton>
        </BottomActionBar>
      )}
    </div>
  );
};

export default Facilities;
