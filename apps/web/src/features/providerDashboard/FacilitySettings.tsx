import React, { useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, CirclePause, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OwnProvider, UpdateProviderBody } from '@coldlink/shared';
import { describeApiError } from '../../api/describeError';
import { facilityKey, providerDashboardQuery } from '../../api/providerBookings';
import { OWN_PROVIDERS_KEY, ownProvidersQuery, updateProvider } from '../../api/providers';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SecondaryButton from '../../components/ui/SecondaryButton';
import { useSessionStore } from '../../session/sessionContext';
import { LoadFailed } from '../booking/BookingStates';
import { apiFieldErrors } from '../provider/apiFieldErrors';
import { TextField } from '../provider/fields';
import PhotoManager from '../provider/PhotoManager';
import { usePhotoManager } from '../provider/usePhotoManager';
import { formatAmount } from '../search/units';
import { FacilityNotFound, ListSkeleton } from './ProviderStates';
import {
  isSettingsField,
  readSettings,
  settingsFormFor,
  typedCapacity,
  type SettingsErrors,
  type SettingsField,
  type SettingsForm,
} from './settingsForm';
import { useProviderParams } from './useProviderParams';

/** Puts what the API answered into Your facilities at once, then reads the facility again. */
const useKeepProvider = (providerId: string) => {
  const queryClient = useQueryClient();
  return (saved: OwnProvider) => {
    queryClient.setQueryData<OwnProvider[]>(OWN_PROVIDERS_KEY, (list) =>
      list?.map((provider) => (provider.id === saved.id ? saved : provider)),
    );
    void queryClient.invalidateQueries({ queryKey: OWN_PROVIDERS_KEY });
    void queryClient.invalidateQueries({ queryKey: facilityKey(providerId) });
  };
};

// Pausing hides the facility from search and booking at once, so it saves on its own tap.
const BookingsCard = ({ provider }: { provider: OwnProvider }) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const keepProvider = useKeepProvider(provider.id);
  const accepting = provider.is_accepting_bookings;
  const toggle = useMutation({
    mutationFn: (is_accepting_bookings: boolean) =>
      updateProvider(store.authorizedRequest, provider.id, { is_accepting_bookings }),
    onSuccess: keepProvider,
  });
  const StateIcon = accepting ? CheckCircle2 : CirclePause;

  return (
    <Card className="p-5 mb-6">
      <CardTitle>{t('provider.settings.bookingsTitle')}</CardTitle>
      <p
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label font-semibold mb-2 ${
          accepting ? 'bg-primary-soft text-primary-strong' : 'bg-accent-faint text-accent-ink'
        }`}
      >
        <StateIcon size={16} strokeWidth={2.5} aria-hidden="true" />
        {accepting ? t('provider.settings.accepting') : t('provider.settings.paused')}
      </p>
      <p className="text-copy-muted text-body mb-4">
        {accepting ? t('provider.settings.acceptingHint') : t('provider.settings.pausedHint')}
      </p>
      <div className="flex flex-col gap-3">
        {toggle.isError && <ErrorMessage>{describeApiError(toggle.error, t)}</ErrorMessage>}
        <SecondaryButton onClick={() => toggle.mutate(!accepting)} disabled={toggle.isPending}>
          {toggle.isPending
            ? t(accepting ? 'provider.settings.pausing' : 'provider.settings.resuming')
            : t(accepting ? 'provider.settings.pause' : 'provider.settings.resume')}
        </SecondaryButton>
      </div>
    </Card>
  );
};

interface NumberRowProps {
  field: 'phone' | 'whatsapp';
  label: string;
  masked: string | null;
  /** The new number as typed, or undefined while the current one is kept. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error: string | undefined;
}

const NumberRow = ({ field, label, masked, value, onChange, error }: NumberRowProps) => {
  const { t } = useTranslation();
  const isPhone = field === 'phone';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-copy-muted text-label">{label}</p>
          <p className="text-ink text-body font-medium break-words">
            {masked ?? t('provider.settings.noWhatsapp')}
          </p>
        </div>
        {value === undefined && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={
              isPhone
                ? t('provider.settings.changeSmsLabel')
                : masked === null
                  ? t('provider.settings.addWhatsappLabel')
                  : t('provider.settings.changeWhatsappLabel')
            }
            className="min-h-12 px-2 text-primary-strong font-semibold text-body underline underline-offset-2 shrink-0"
          >
            {masked === null ? t('provider.settings.add') : t('provider.settings.change')}
          </button>
        )}
      </div>
      {value !== undefined && (
        <>
          <TextField
            id={`settings-${field}`}
            label={
              isPhone ? t('provider.settings.newSmsLabel') : t('provider.settings.newWhatsappLabel')
            }
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('provider.contact.phonePlaceholder')}
            value={value}
            onChange={onChange}
            error={error}
          />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="self-start min-h-12 text-copy-muted font-medium text-body underline underline-offset-2"
          >
            {t('provider.settings.keepNumber')}
          </button>
        </>
      )}
    </div>
  );
};

type Notice = 'saved' | 'nothingChanged';

const SettingsBody = ({ provider }: { provider: OwnProvider }) => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const keepProvider = useKeepProvider(provider.id);
  const dashboard = useQuery(providerDashboardQuery(store.authorizedRequest, provider.id));
  const photos = usePhotoManager(provider, keepProvider);
  const [form, setForm] = useState<SettingsForm>(() => settingsFormFor(provider));
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<SettingsField, string>>>({});
  const [notice, setNotice] = useState<Notice>();
  // The button is disabled while saving; this also drops a tap that lands before the re-render.
  const saving = useRef(false);

  const save = useMutation({
    mutationFn: (body: UpdateProviderBody) =>
      updateProvider(store.authorizedRequest, provider.id, body),
    onSuccess: (saved) => {
      keepProvider(saved);
      setForm(settingsFormFor(saved));
      setNotice('saved');
    },
    onError: (error) => setServerErrors(apiFieldErrors(error, isSettingsField) ?? {}),
    onSettled: () => {
      saving.current = false;
    },
  });

  const change = (field: SettingsField, changes: Partial<SettingsForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(undefined);
  };

  const errorFor = (field: SettingsField) => {
    const key = errors[field];
    return key ? t(`provider.errors.${key}`) : serverErrors[field];
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (saving.current) return;
    save.reset();
    const read = readSettings(form, provider);
    if ('errors' in read) {
      setErrors(read.errors);
      return;
    }
    if (Object.keys(read.body).length === 0) {
      setNotice('nothingChanged');
      return;
    }
    saving.current = true;
    save.mutate(read.body);
  };

  const unit = provider.capacity_unit;
  const booked = dashboard.data?.occupancy.used;
  const capacity = typedCapacity(form);
  const belowBooked = booked !== undefined && capacity !== undefined && capacity < booked;
  const submitError =
    save.isError && !apiFieldErrors(save.error, isSettingsField)
      ? describeApiError(save.error, t)
      : undefined;

  return (
    <>
      <div className="px-5 pt-6 pb-5 rim">
        <h1 className="text-headline-lg font-bold text-ink tracking-tight break-words">
          {provider.display_name}
        </h1>
      </div>
      <div className="flex flex-col px-5 pt-6">
        <BookingsCard provider={provider} />

        <form noValidate onSubmit={handleSubmit} className="flex flex-col">
          <Card className="p-5 mb-6">
            <CardTitle>{t('provider.settings.spaceTitle')}</CardTitle>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <TextField
                  id="settings-capacity"
                  label={t('provider.capacity.capacityLabel')}
                  hint={t('provider.settings.unitNote', {
                    unit: t(`provider.capacity.unitSuffix.${unit}`),
                  })}
                  inputMode="decimal"
                  suffix={t(`provider.capacity.unitSuffix.${unit}`)}
                  value={form.capacity}
                  onChange={(text) => change('capacity_total', { capacity: text })}
                  error={errorFor('capacity_total')}
                />
                {belowBooked && (
                  <p className="flex items-start gap-2 rounded-lg bg-accent-faint text-accent-ink px-3 py-2 text-label font-medium">
                    <TriangleAlert size={18} aria-hidden="true" className="shrink-0 mt-0.5" />
                    {t('provider.settings.belowBooked', { booked: formatAmount(booked, unit, t) })}
                  </p>
                )}
              </div>
              <TextField
                id="settings-price"
                label={t('provider.capacity.priceLabelFor', {
                  unit: t(`provider.capacity.perUnit.${unit}`),
                })}
                hint={t('provider.settings.priceHint')}
                inputMode="decimal"
                suffix={t('provider.capacity.naira')}
                value={form.price}
                onChange={(text) => change('price_per_unit_per_day_kobo', { price: text })}
                error={errorFor('price_per_unit_per_day_kobo')}
              />
            </div>
          </Card>

          <Card className="p-5 mb-6">
            <CardTitle>{t('provider.settings.numbersTitle')}</CardTitle>
            <div className="flex flex-col gap-5">
              <NumberRow
                field="phone"
                label={t('provider.settings.smsLabel')}
                masked={provider.phone_masked}
                value={form.phone}
                onChange={(phone) => change('phone', { phone })}
                error={errorFor('phone')}
              />
              <NumberRow
                field="whatsapp"
                label={t('provider.settings.whatsappLabel')}
                masked={provider.whatsapp_masked}
                value={form.whatsapp}
                onChange={(whatsapp) => change('whatsapp', { whatsapp })}
                error={errorFor('whatsapp')}
              />
            </div>
          </Card>

          <div className="flex flex-col gap-3 mb-8">
            {submitError && <ErrorMessage>{submitError}</ErrorMessage>}
            {notice && (
              <p
                role="status"
                className="flex items-center gap-2 text-primary-strong text-body font-semibold"
              >
                {notice === 'saved' && (
                  <CheckCircle2
                    size={18}
                    className="text-primary-strong shrink-0"
                    aria-hidden="true"
                  />
                )}
                {t(`provider.settings.${notice}`)}
              </p>
            )}
            <PrimaryButton type="submit" disabled={save.isPending}>
              {save.isPending ? t('provider.settings.saving') : t('provider.settings.save')}
            </PrimaryButton>
          </div>
        </form>

        <Card className="p-5 mb-6">
          <PhotoManager photos={photos} hint={t('provider.settings.photosHint')} />
        </Card>
      </div>
    </>
  );
};

/** What the owner can change about a facility: bookings on or off, space, price, numbers, photos. */
const FacilitySettings = () => {
  const { t } = useTranslation();
  const store = useSessionStore();
  const { providerId } = useProviderParams();
  const facilities = useQuery(ownProvidersQuery(store.authorizedRequest));
  const navTitle = t('provider.settings.navTitle');
  const provider = facilities.data?.find(({ id }) => id === providerId);

  if (providerId === undefined || (facilities.isSuccess && provider === undefined)) {
    return <FacilityNotFound navTitle={navTitle} />;
  }
  if (facilities.isError && facilities.data === undefined) {
    return (
      <LoadFailed
        navTitle={navTitle}
        title={t('provider.settings.failedTitle')}
        error={facilities.error}
        retry={() => void facilities.refetch()}
        retrying={facilities.isFetching}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      <TopNavBar title={navTitle} showBack={true} />
      {provider ? (
        <SettingsBody key={provider.id} provider={provider} />
      ) : (
        <div className="px-5 pt-6">
          <ListSkeleton label={t('provider.settings.loading')} rows={3} />
        </div>
      )}
    </div>
  );
};

export default FacilitySettings;
