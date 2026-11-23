import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { ONBOARDING_STEPS, redirectFor, useOnboardingFlow } from './onboardingFlow';
import PhotoManager from './PhotoManager';
import StepScreen from './StepScreen';
import { usePhotoManager } from './usePhotoManager';

const PhotosStep = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const flow = useOnboardingFlow();
  const created = flow.draft.created;
  const photos = usePhotoManager(created, flow.setCreated);

  const redirect = redirectFor(flow.draft, 'photos');
  if (redirect) return <Navigate to={redirect} replace />;
  if (!created) return <Navigate to={ONBOARDING_STEPS.contact} replace />;

  const { busy, uploadedCount } = photos;

  return (
    <StepScreen
      step="photos"
      title={t('provider.photos.title')}
      intro={t('provider.photos.intro')}
      showBack={false}
      onSubmit={() => {
        if (!busy) void navigate(ONBOARDING_STEPS.done, { replace: true });
      }}
      action={
        <PrimaryButton type="submit" disabled={busy}>
          {busy
            ? t('provider.photos.finishWaiting')
            : uploadedCount === 0
              ? t('provider.photos.finishWithout')
              : t('provider.photos.finish')}
        </PrimaryButton>
      }
    >
      <div className="flex items-center gap-2 bg-primary-faint border border-primary-muted rounded-xl px-4 py-3">
        <CheckCircle2 size={16} className="text-primary-strong shrink-0" aria-hidden="true" />
        <span className="text-ink text-body font-medium">
          {t('provider.photos.saved', { name: created.display_name })}
        </span>
      </div>

      <PhotoManager photos={photos} />
    </StepScreen>
  );
};

export default PhotosStep;
