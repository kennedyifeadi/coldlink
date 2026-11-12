import React, { lazy, Suspense } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { oyoLgas } from './oyoLgas';
import { SelectField, TextField } from './fields';
import { readLocation } from './providerForm';
import StepScreen from './StepScreen';
import { useStepForm } from './useStepForm';

// The search's map, loaded only when this step opens.
const PinMap = lazy(() => import('../search/PinMap'));

const MapPlaceholder = () => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="h-64 rounded-xl bg-surface-muted flex items-center justify-center text-copy-subtle text-body"
    >
      {t('search.location.mapLoading')}
    </div>
  );
};

const LocationStep = () => {
  const { t } = useTranslation();
  const { form, change, errorFor, continueWith, redirect } = useStepForm('location');

  if (redirect) return <Navigate to={redirect} replace />;

  const pinError = errorFor('lat') ?? errorFor('lng');

  return (
    <StepScreen
      step="location"
      title={t('provider.location.title')}
      intro={t('provider.location.intro')}
      onSubmit={() => continueWith(readLocation(form))}
      action={
        <PrimaryButton type="submit" withArrow>
          {t('common.continue')}
        </PrimaryButton>
      }
    >
      <section aria-labelledby="pin-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="pin-heading" className="block text-label font-medium text-copy mb-1">
            {t('provider.location.pinTitle')}
          </h2>
          <p className="text-copy-muted text-body">{t('provider.location.pinHint')}</p>
        </div>
        <Suspense fallback={<MapPlaceholder />}>
          {/* Exact, not rounded as a farmer's pin is: the facility's place is public (decision 89). */}
          <PinMap
            pin={form.pin}
            onPick={(lat, lng) => change('lat', { pin: { lat, lng } })}
            label={t('provider.location.mapLabel')}
          />
        </Suspense>
        {form.pin && (
          <div className="flex items-center gap-2 bg-primary-faint border border-primary-muted rounded-xl px-4 py-3">
            <CheckCircle2 size={16} className="text-primary-strong shrink-0" aria-hidden="true" />
            <span className="text-ink text-body font-medium">
              {t('provider.location.pinDropped')}
            </span>
          </div>
        )}
        {pinError && <ErrorMessage>{pinError}</ErrorMessage>}
      </section>

      <TextField
        id="address"
        label={t('provider.location.addressLabel')}
        placeholder={t('provider.location.addressPlaceholder')}
        autoComplete="street-address"
        value={form.address}
        onChange={(address) => change('address_text', { address })}
        error={errorFor('address_text')}
      />

      <TextField
        id="landmark"
        label={t('provider.location.landmarkLabel')}
        hint={t('provider.location.landmarkHint')}
        optional
        value={form.landmark}
        onChange={(landmark) => change('landmark', { landmark })}
        error={errorFor('landmark')}
      />

      <SelectField
        id="lga"
        label={t('provider.location.lgaLabel')}
        optional
        placeholder={t('provider.location.lgaPlaceholder')}
        options={oyoLgas}
        value={form.lga}
        onChange={(lga) => change('lga', { lga })}
        error={errorFor('lga')}
      />
    </StepScreen>
  );
};

export default LocationStep;
