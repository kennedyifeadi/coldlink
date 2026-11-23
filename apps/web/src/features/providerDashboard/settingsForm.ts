import {
  koboToNaira,
  phoneSchema,
  type OwnProvider,
  type UpdateProviderBody,
} from '@coldlink/shared';
import { readCapacityTotal, readPrice, type FieldErrorKey } from '../provider/providerForm';

// What the settings screen lets the owner change. capacity_unit is left out on purpose: bookings
// and availability are counted in the facility's unit, so changing it would mix units.
export const settingsFields = [
  'capacity_total',
  'price_per_unit_per_day_kobo',
  'phone',
  'whatsapp',
] as const;
export type SettingsField = (typeof settingsFields)[number];

export const isSettingsField = (field: string): field is SettingsField =>
  (settingsFields as readonly string[]).includes(field);

/** The entries as typed; a number is undefined until the owner asks to change it. */
export interface SettingsForm {
  capacity: string;
  price: string;
  phone: string | undefined;
  whatsapp: string | undefined;
}

export type SettingsErrors = Partial<Record<SettingsField, FieldErrorKey>>;

export const settingsFormFor = (provider: OwnProvider): SettingsForm => ({
  capacity: String(provider.capacity_total),
  price: String(koboToNaira(provider.price_per_unit_per_day_kobo)),
  phone: undefined,
  whatsapp: undefined,
});

// A blank number field changes nothing: the masked number stays as it is.
const readPhone = (text: string | undefined) => {
  const trimmed = text?.trim();
  if (trimmed === undefined || trimmed === '') return { value: undefined };
  const parsed = phoneSchema.safeParse(trimmed);
  return parsed.success ? { value: parsed.data } : { invalid: true as const };
};

/** The space typed, when it is a valid one; for the warning about today's bookings. */
export const typedCapacity = (form: SettingsForm) => {
  const capacity = readCapacityTotal(form.capacity);
  return 'value' in capacity ? capacity.value : undefined;
};

/** The errors to show, or a body holding only the fields that differ from the facility. */
export const readSettings = (
  form: SettingsForm,
  provider: OwnProvider,
): { errors: SettingsErrors } | { body: UpdateProviderBody } => {
  const errors: SettingsErrors = {};
  const body: UpdateProviderBody = {};

  const capacity = readCapacityTotal(form.capacity);
  if ('error' in capacity) errors.capacity_total = capacity.error;
  else if (capacity.value !== provider.capacity_total) body.capacity_total = capacity.value;

  const price = readPrice(form.price);
  if ('error' in price) errors.price_per_unit_per_day_kobo = price.error;
  else if (price.value !== provider.price_per_unit_per_day_kobo) {
    body.price_per_unit_per_day_kobo = price.value;
  }

  const phone = readPhone(form.phone);
  if ('invalid' in phone) errors.phone = 'phoneInvalid';
  else if (phone.value !== undefined) body.phone = phone.value;

  const whatsapp = readPhone(form.whatsapp);
  if ('invalid' in whatsapp) errors.whatsapp = 'whatsappInvalid';
  else if (whatsapp.value !== undefined) body.whatsapp = whatsapp.value;

  return Object.keys(errors).length > 0 ? { errors } : { body };
};
