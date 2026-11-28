import type { TFunction } from 'i18next';
import {
  normalisePhone,
  pricingInputSchema,
  type CapacityUnit,
  type DeliveryDetailsBody,
  type DeliveryLoad,
  type DeliveryWindow,
  type GeoPoint,
} from '@coldlink/shared';
import { formatDate } from '../../i18n/format';

// The farmer's end of a delivery as they fill it in (PRD 7.7 step 2). It is personal data: held
// in memory only, never in the URL or browser storage.
export interface DeliveryFormValues {
  address: string;
  pin: GeoPoint | undefined;
  phone: string;
  name: string;
  load: string;
  quantity: string;
  day: string;
}

export type DeliveryField = keyof DeliveryFormValues;
export type DeliveryFormErrors = Partial<Record<DeliveryField, string>>;

// The limits deliveryDetailsSchema puts on its text fields.
const ADDRESS_MAX = 300;
const NAME_MAX = 100;
const LOAD_MAX = 300;

/** A new form, with the load prefilled from the booking. */
export const emptyDeliveryForm = (load: {
  crop: string;
  quantity: number;
}): DeliveryFormValues => ({
  address: '',
  pin: undefined,
  phone: '',
  name: '',
  load: load.crop,
  quantity: String(load.quantity),
  day: '',
});

const readQuantity = (value: string, unit: CapacityUnit): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const quantity = Number(trimmed);
  if (!pricingInputSchema.shape.quantity.safeParse(quantity).success) return undefined;
  return unit === 'crates' && !Number.isInteger(quantity) ? undefined : quantity;
};

/** What a quote needs, once the pin and a valid amount are in; undefined until then. */
export const deliveryLoadOf = (
  values: DeliveryFormValues,
  unit: CapacityUnit,
): DeliveryLoad | undefined => {
  const quantity = readQuantity(values.quantity, unit);
  if (!values.pin || quantity === undefined) return undefined;
  return { location: values.pin, load_quantity: quantity, load_unit: unit };
};

export const windowText = (window: DeliveryWindow) => ({
  start: formatDate(window.earliest_date),
  end: formatDate(window.latest_date),
});

const textError = (value: string, max: number, missing: string, t: TFunction) => {
  const trimmed = value.trim();
  if (trimmed === '') return missing;
  return trimmed.length > max ? t('booking.delivery.errors.tooLong', { max }) : undefined;
};

type ReadDeliveryForm = { details: DeliveryDetailsBody } | { errors: DeliveryFormErrors };

/** The request body's delivery details, or what to fix, field by field. */
export const readDeliveryForm = (
  values: DeliveryFormValues,
  unit: CapacityUnit,
  window: DeliveryWindow | undefined,
  t: TFunction,
): ReadDeliveryForm => {
  const quantity = readQuantity(values.quantity, unit);
  const phone = normalisePhone(values.phone);
  const name = values.name.trim();
  const dayInWindow =
    window !== undefined &&
    values.day !== '' &&
    window.earliest_date <= values.day &&
    values.day <= window.latest_date;
  const errors: DeliveryFormErrors = {
    address: textError(values.address, ADDRESS_MAX, t('booking.delivery.errors.address'), t),
    pin: values.pin ? undefined : t('booking.delivery.errors.pin'),
    phone: phone ? undefined : t('booking.delivery.errors.phone'),
    name:
      name.length > NAME_MAX ? t('booking.delivery.errors.tooLong', { max: NAME_MAX }) : undefined,
    load: textError(values.load, LOAD_MAX, t('booking.delivery.errors.load'), t),
    quantity:
      quantity !== undefined
        ? undefined
        : t(
            unit === 'crates'
              ? 'booking.delivery.errors.crates'
              : 'booking.delivery.errors.quantity',
          ),
    day: dayInWindow
      ? undefined
      : window
        ? t('booking.delivery.errors.day', windowText(window))
        : t('booking.delivery.errors.dayUnknown'),
  };
  const found = Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined),
  ) as DeliveryFormErrors;
  if (Object.keys(found).length > 0 || !values.pin || !phone || quantity === undefined) {
    return { errors: found };
  }
  return {
    details: {
      address_text: values.address.trim(),
      location: values.pin,
      contact_phone: phone,
      ...(name === '' ? {} : { contact_name: name }),
      load_description: values.load.trim(),
      load_quantity: quantity,
      load_unit: unit,
      scheduled_for: values.day,
    },
  };
};

const API_FIELDS: Record<string, DeliveryField> = {
  address_text: 'address',
  location: 'pin',
  contact_phone: 'phone',
  contact_name: 'name',
  load_description: 'load',
  load_quantity: 'quantity',
  scheduled_for: 'day',
};

/** The form field an API body path (`scheduled_for`, `delivery.scheduled_for`) is about. */
export const deliveryFieldOf = (path: string): DeliveryField | undefined => {
  const [first, second] = path.split('.');
  const name = first === 'delivery' ? second : first;
  return name === undefined ? undefined : API_FIELDS[name];
};
