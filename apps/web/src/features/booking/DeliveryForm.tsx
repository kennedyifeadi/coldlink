import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { CheckCircle2, Crosshair } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CapacityUnit, DeliveryDirection, DeliveryWindow } from '@coldlink/shared';
import ErrorMessage from '../../components/ui/ErrorMessage';
import SecondaryButton from '../../components/ui/SecondaryButton';
import { inputClasses, labelClasses } from '../../components/ui/inputStyles';
import { TextField } from '../provider/fields';
import { useDeviceLocation, type DeviceLocationFailure } from '../search/useDeviceLocation';
import { windowText, type DeliveryFormErrors, type DeliveryFormValues } from './deliveryFields';

// The search's map, loaded only when a delivery form opens.
const PinMap = lazy(() => import('../search/PinMap'));

const locationFailureKeys = {
  denied: 'booking.delivery.form.locationDenied',
  unavailable: 'booking.delivery.form.locationUnavailable',
  unsupported: 'booking.delivery.form.locationUnsupported',
} as const satisfies Record<DeviceLocationFailure, string>;

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

interface PinFieldProps {
  direction: DeliveryDirection;
  pin: DeliveryFormValues['pin'];
  onPick: (pin: { lat: number; lng: number }) => void;
  error: string | undefined;
}

/** Where the driver goes, exactly: a tap on the map, or the phone's location. */
const PinField = ({ direction, pin, onPick, error }: PinFieldProps) => {
  const { t } = useTranslation();
  const device = useDeviceLocation();
  const located = device.state.status === 'located' ? device.state : undefined;
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
  });

  // Only a new fix moves the pin, so a tap on the map afterwards wins. Not rounded as a search's
  // place is: the driver needs the spot itself (decision 157).
  useEffect(() => {
    if (located) onPickRef.current({ lat: located.lat, lng: located.lng });
  }, [located]);

  return (
    <section aria-labelledby="delivery-pin-heading" className="flex flex-col gap-3">
      <div>
        <h3 id="delivery-pin-heading" className={labelClasses}>
          {t(`booking.delivery.form.${direction}.pinTitle`)}
        </h3>
        <p className="text-copy-muted text-label">
          {t(`booking.delivery.form.${direction}.pinHint`)}
        </p>
      </div>
      <SecondaryButton onClick={device.locate} disabled={device.state.status === 'locating'}>
        <span className="inline-flex items-center gap-2">
          <Crosshair size={18} aria-hidden="true" />
          {device.state.status === 'locating'
            ? t('search.location.locating')
            : t('booking.delivery.form.useLocation')}
        </span>
      </SecondaryButton>
      {device.state.status === 'failed' && (
        <ErrorMessage>{t(locationFailureKeys[device.state.reason])}</ErrorMessage>
      )}
      <Suspense fallback={<MapPlaceholder />}>
        <PinMap
          pin={pin}
          onPick={(lat, lng) => onPick({ lat, lng })}
          label={t(`booking.delivery.form.${direction}.mapLabel`)}
        />
      </Suspense>
      {pin && (
        <p className="flex items-center gap-2 text-primary-strong text-body font-semibold">
          <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />
          {t('booking.delivery.form.pinSet')}
        </p>
      )}
      {error && <ErrorMessage id="delivery-pin-error">{error}</ErrorMessage>}
    </section>
  );
};

interface DayFieldProps {
  direction: DeliveryDirection;
  value: string;
  onChange: (day: string) => void;
  window: DeliveryWindow | undefined;
  error: string | undefined;
}

const DayField = ({ direction, value, onChange, window, error }: DayFieldProps) => {
  const { t } = useTranslation();
  const describedBy = [window && 'delivery-day-hint', error && 'delivery-day-error']
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label htmlFor="delivery-day" className={labelClasses}>
        {t(`booking.delivery.form.${direction}.dayLabel`)}
      </label>
      {window && (
        <p id="delivery-day-hint" className="text-copy-muted text-label mb-2">
          {t('booking.delivery.form.dayHint', windowText(window))}
        </p>
      )}
      <input
        id="delivery-day"
        type="date"
        min={window?.earliest_date}
        max={window?.latest_date}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy || undefined}
        className={inputClasses(error !== undefined)}
      />
      {error && (
        <div className="mt-2">
          <ErrorMessage id="delivery-day-error">{error}</ErrorMessage>
        </div>
      )}
    </div>
  );
};

interface DeliveryFormProps {
  direction: DeliveryDirection;
  /** The booking's unit: the load is counted as the space is. */
  unit: CapacityUnit;
  values: DeliveryFormValues;
  onChange: (changes: Partial<DeliveryFormValues>) => void;
  errors: DeliveryFormErrors;
  /** The days the quote allows, once there is one. */
  window: DeliveryWindow | undefined;
}

/** The farmer's end of a delivery: pickup inbound, drop-off outbound (decision 146). */
const DeliveryForm = ({ direction, unit, values, onChange, errors, window }: DeliveryFormProps) => {
  const { t } = useTranslation();
  const form = `booking.delivery.form.${direction}` as const;

  return (
    <div className="flex flex-col gap-5">
      <TextField
        id="delivery-address"
        label={t(`${form}.addressLabel`)}
        hint={t('booking.delivery.form.addressHint')}
        autoComplete="street-address"
        value={values.address}
        onChange={(address) => onChange({ address })}
        error={errors.address}
      />
      <PinField
        direction={direction}
        pin={values.pin}
        onPick={(pin) => onChange({ pin })}
        error={errors.pin}
      />
      <TextField
        id="delivery-phone"
        label={t(`${form}.phoneLabel`)}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={t('booking.delivery.form.phonePlaceholder')}
        value={values.phone}
        onChange={(phone) => onChange({ phone })}
        error={errors.phone}
      />
      <TextField
        id="delivery-name"
        label={t(`${form}.nameLabel`)}
        optional
        autoComplete="name"
        value={values.name}
        onChange={(name) => onChange({ name })}
        error={errors.name}
      />
      <TextField
        id="delivery-load"
        label={t('booking.delivery.form.loadLabel')}
        value={values.load}
        onChange={(load) => onChange({ load })}
        error={errors.load}
      />
      <TextField
        id="delivery-quantity"
        label={t('booking.delivery.form.quantityLabel')}
        inputMode={unit === 'crates' ? 'numeric' : 'decimal'}
        suffix={t(`booking.delivery.form.unit.${unit}`)}
        value={values.quantity}
        onChange={(quantity) => onChange({ quantity })}
        error={errors.quantity}
      />
      <DayField
        direction={direction}
        value={values.day}
        onChange={(day) => onChange({ day })}
        window={window}
        error={errors.day}
      />
    </div>
  );
};

export default DeliveryForm;
