import React from 'react';
import { ChevronRight, MapPin } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { OwnProvider } from '@coldlink/shared';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PageHeader from '../../components/ui/PageHeader';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import { describeApiError } from '../../api/describeError';
import { ownProvidersQuery } from '../../api/providers';
import { useSessionStore } from '../../session/sessionContext';
import { providerDashboardPath } from '../../session/routes';
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

  return (
    <Link
      to={providerDashboardPath(provider.id)}
      className="group flex items-start gap-4 px-5 py-5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <div className="flex flex-col gap-1 min-w-0 flex-grow">
        <VerificationBadge status={provider.verification_status} />
        <h2 className="font-bold text-ink text-subtitle mt-1">{provider.display_name}</h2>
        <p className="text-copy-muted text-label">
          {t(`search.facilityTypes.${provider.facility_type}`)}
        </p>
        <p className="flex items-start gap-1.5 text-ink text-label">
          <MapPin size={15} aria-hidden="true" className="shrink-0 mt-0.5 text-copy-subtle" />
          <span>
            {provider.lga ? `${provider.address_text}, ${provider.lga}` : provider.address_text}
          </span>
        </p>
      </div>
      <ChevronRight
        size={20}
        className="text-copy-subtle shrink-0 mt-1 transition-transform duration-150 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
};

const FacilitiesSkeleton = () => (
  <div aria-hidden="true" className="flex flex-col gap-4 px-5 pt-5">
    {Array.from({ length: 2 }, (_, index) => (
      <div key={index} className="h-32 rounded-xl bg-surface-muted" />
    ))}
  </div>
);

/**
 * The way into onboarding. A user with no facility goes straight to the wizard; one who has
 * facilities sees them here, each opening its dashboard, and can list another.
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
    <div className="flex flex-col min-h-screen bg-background">
      <TopNavBar title={t('provider.facilities.navTitle')} showBack={true} />
      <PageHeader title={t('provider.facilities.title')} intro={t('provider.facilities.intro')} />

      <div className="flex flex-col pb-32">
        {(facilities.isPending || (facilities.isFetching && facilities.data?.length === 0)) && (
          <>
            <p role="status" className="sr-only">
              {t('provider.facilities.loading')}
            </p>
            <FacilitiesSkeleton />
          </>
        )}

        {facilities.isError && (
          <div className="flex flex-col gap-3 px-5 pt-5">
            <ErrorMessage>{describeApiError(facilities.error, t)}</ErrorMessage>
            <TextButton onClick={() => void facilities.refetch()} disabled={facilities.isFetching}>
              {t('common.tryAgain')}
            </TextButton>
          </div>
        )}

        {facilities.isSuccess && facilities.data.length > 0 && (
          <ul className="divide-y divide-line border-b border-line">
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
          <PrimaryButton onClick={listAnother}>
            {t('provider.facilities.listAnother')}
          </PrimaryButton>
        </BottomActionBar>
      )}
    </div>
  );
};

export default Facilities;
