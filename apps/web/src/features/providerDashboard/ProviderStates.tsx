import React from 'react';
import { SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PROVIDER_ONBOARDING_PATH } from '../../session/routes';
import { ProblemScreen } from '../booking/BookingStates';

/** A facility id that is unknown, malformed or someone else's: the API says the same for each. */
export const FacilityNotFound = ({ navTitle }: { navTitle: string }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <ProblemScreen
      navTitle={navTitle}
      icon={SearchX}
      title={t('provider.dashboard.notFoundTitle')}
      body={t('provider.dashboard.notFoundBody')}
      action={t('provider.dashboard.backToFacilities')}
      onAction={() => void navigate(PROVIDER_ONBOARDING_PATH, { replace: true })}
    />
  );
};

export const ListSkeleton = ({ label, rows = 2 }: { label: string; rows?: number }) => (
  <div className="flex flex-col gap-4">
    <p role="status" className="text-copy-muted text-body text-center">
      {label}
    </p>
    <div aria-hidden="true" className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-36 rounded-2xl bg-surface-muted" />
      ))}
    </div>
  </div>
);
