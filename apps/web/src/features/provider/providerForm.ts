import {
  createProviderBodySchema,
  nairaToKobo,
  temperaturesInOrder,
  type BackupPower,
  type CapacityUnit,
  type CreateProviderBody,
  type FacilityType,
} from '@coldlink/shared';

// What the provider has typed on each step, kept as typed so that going back shows it unchanged.
// The shared schema decides what is valid; these readers only pick the message to show.

export interface ContactForm {
  displayName: string;
  businessName: string;
  facilityType: FacilityType | undefined;
  /** Booking SMS go to the user's own number unless they give another (decision 62). */
  useOwnPhone: boolean;
  phone: string;
  whatsapp: string;
}

export interface LocationForm {
  pin: { lat: number; lng: number } | undefined;
  address: string;
  landmark: string;
  lga: string;
}

export interface CapacityForm {
  capacity: string;
  unit: CapacityUnit | undefined;
  price: string;
  minDays: number;
  tempMin: string;
  tempMax: string;
  backupPower: BackupPower | undefined;
}

export interface ProduceForm {
  categoryIds: string[];
}

export interface OnboardingForms {
  contact: ContactForm;
  location: LocationForm;
  capacity: CapacityForm;
  produce: ProduceForm;
}

export const emptyForms: OnboardingForms = {
  contact: {
    displayName: '',
    businessName: '',
    facilityType: undefined,
    useOwnPhone: true,
    phone: '',
    whatsapp: '',
  },
  location: { pin: undefined, address: '', landmark: '', lga: '' },
  capacity: {
    capacity: '',
    unit: undefined,
    price: '',
    minDays: 1,
    tempMin: '',
    tempMax: '',
    backupPower: undefined,
  },
  produce: { categoryIds: [] },
};

export type ProviderField = keyof CreateProviderBody;

/** Keys under provider.errors in the translations. */
export type FieldErrorKey =
  | 'displayNameMissing'
  | 'displayNameTooLong'
  | 'businessNameTooLong'
  | 'facilityTypeMissing'
  | 'phoneInvalid'
  | 'whatsappInvalid'
  | 'pinMissing'
  | 'addressMissing'
  | 'addressTooLong'
  | 'landmarkTooLong'
  | 'capacityMissing'
  | 'capacityNotPositive'
  | 'capacityTooPrecise'
  | 'unitMissing'
  | 'priceMissing'
  | 'priceNotPositive'
  | 'priceTooPrecise'
  | 'temperatureInvalid'
  | 'temperatureOrder'
  | 'categoriesMissing';

export type FieldErrors = Partial<Record<ProviderField, FieldErrorKey>>;

type Read<T> = { body: T } | { errors: FieldErrors };

const shape = createProviderBodySchema.shape;

const isValid = <F extends ProviderField>(field: F, value: unknown) =>
  shape[field].safeParse(value).success;

const finish = <T>(body: T, errors: FieldErrors): Read<T> =>
  Object.keys(errors).length > 0 ? { errors } : { body };

/** Trimmed text, or undefined when blank, so optional fields are left out of the body. */
const optionalText = (text: string) => {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : trimmed;
};

const requiredText = (
  field: ProviderField,
  text: string,
  missing: FieldErrorKey,
  tooLong: FieldErrorKey,
): { value: string } | { error: FieldErrorKey } => {
  const trimmed = text.trim();
  if (trimmed === '') return { error: missing };
  return isValid(field, trimmed) ? { value: trimmed } : { error: tooLong };
};

type ContactBody = Pick<
  CreateProviderBody,
  'display_name' | 'business_name' | 'facility_type' | 'phone' | 'whatsapp'
>;

export const readContact = (form: ContactForm): Read<ContactBody> => {
  const errors: FieldErrors = {};
  const name = requiredText(
    'display_name',
    form.displayName,
    'displayNameMissing',
    'displayNameTooLong',
  );
  if ('error' in name) errors.display_name = name.error;
  const businessName = optionalText(form.businessName);
  if (businessName !== undefined && !isValid('business_name', businessName)) {
    errors.business_name = 'businessNameTooLong';
  }
  if (form.facilityType === undefined) errors.facility_type = 'facilityTypeMissing';
  const phone = form.useOwnPhone ? undefined : shape.phone.safeParse(form.phone);
  if (phone && !phone.success) errors.phone = 'phoneInvalid';
  const whatsappText = optionalText(form.whatsapp);
  const whatsapp = whatsappText === undefined ? undefined : shape.whatsapp.safeParse(whatsappText);
  if (whatsapp && !whatsapp.success) errors.whatsapp = 'whatsappInvalid';

  return finish(
    {
      display_name: 'value' in name ? name.value : '',
      facility_type: form.facilityType!,
      ...(businessName !== undefined && { business_name: businessName }),
      ...(phone?.data && { phone: phone.data }),
      ...(whatsapp?.data && { whatsapp: whatsapp.data }),
    },
    errors,
  );
};

type LocationBody = Pick<CreateProviderBody, 'lat' | 'lng' | 'address_text' | 'landmark' | 'lga'>;

// The pin is kept exact: a facility's location is public business data (decision 89).
export const readLocation = (form: LocationForm): Read<LocationBody> => {
  const errors: FieldErrors = {};
  if (!form.pin || !isValid('lat', form.pin.lat) || !isValid('lng', form.pin.lng)) {
    errors.lat = 'pinMissing';
  }
  const address = requiredText('address_text', form.address, 'addressMissing', 'addressTooLong');
  if ('error' in address) errors.address_text = address.error;
  const landmark = optionalText(form.landmark);
  if (landmark !== undefined && !isValid('landmark', landmark)) errors.landmark = 'landmarkTooLong';
  const lga = optionalText(form.lga);

  return finish(
    {
      lat: form.pin?.lat ?? 0,
      lng: form.pin?.lng ?? 0,
      address_text: 'value' in address ? address.value : '',
      ...(landmark !== undefined && { landmark }),
      ...(lga !== undefined && { lga }),
    },
    errors,
  );
};

/** A number as typed, allowing thousands separators: undefined when blank, NaN when not a number. */
const readNumber = (text: string) => {
  const trimmed = text.trim().replaceAll(',', '');
  return trimmed === '' ? undefined : Number(trimmed);
};

const readCapacityTotal = (text: string): { value: number } | { error: FieldErrorKey } => {
  const value = readNumber(text);
  if (value === undefined || !Number.isFinite(value)) return { error: 'capacityMissing' };
  if (value <= 0) return { error: 'capacityNotPositive' };
  return isValid('capacity_total', value) ? { value } : { error: 'capacityTooPrecise' };
};

// Typed in naira and sent in kobo; nairaToKobo refuses anything finer than a kobo.
const readPrice = (text: string): { value: number } | { error: FieldErrorKey } => {
  const naira = readNumber(text);
  if (naira === undefined || !Number.isFinite(naira)) return { error: 'priceMissing' };
  if (naira <= 0) return { error: 'priceNotPositive' };
  let kobo: number;
  try {
    kobo = nairaToKobo(naira);
  } catch (error) {
    if (error instanceof RangeError) return { error: 'priceTooPrecise' };
    throw error;
  }
  return isValid('price_per_unit_per_day_kobo', kobo) ? { value: kobo } : { error: 'priceMissing' };
};

const readTemperature = (
  text: string,
): { value: number | undefined } | { error: 'temperatureInvalid' } => {
  const value = readNumber(text);
  if (value === undefined) return { value: undefined };
  return Number.isFinite(value) && isValid('temp_min_c', value)
    ? { value }
    : { error: 'temperatureInvalid' };
};

type CapacityBody = Pick<
  CreateProviderBody,
  | 'capacity_total'
  | 'capacity_unit'
  | 'price_per_unit_per_day_kobo'
  | 'min_storage_days'
  | 'temp_min_c'
  | 'temp_max_c'
  | 'has_backup_power'
>;

export const readCapacity = (form: CapacityForm): Read<CapacityBody> => {
  const errors: FieldErrors = {};
  const capacity = readCapacityTotal(form.capacity);
  if ('error' in capacity) errors.capacity_total = capacity.error;
  if (form.unit === undefined) errors.capacity_unit = 'unitMissing';
  const price = readPrice(form.price);
  if ('error' in price) errors.price_per_unit_per_day_kobo = price.error;
  const tempMin = readTemperature(form.tempMin);
  if ('error' in tempMin) errors.temp_min_c = tempMin.error;
  const tempMax = readTemperature(form.tempMax);
  if ('error' in tempMax) errors.temp_max_c = tempMax.error;
  const temperatures = {
    temp_min_c: 'value' in tempMin ? tempMin.value : undefined,
    temp_max_c: 'value' in tempMax ? tempMax.value : undefined,
  };
  if (!errors.temp_min_c && !errors.temp_max_c && !temperaturesInOrder(temperatures)) {
    errors.temp_max_c = 'temperatureOrder';
  }

  return finish(
    {
      capacity_total: 'value' in capacity ? capacity.value : 0,
      capacity_unit: form.unit!,
      price_per_unit_per_day_kobo: 'value' in price ? price.value : 0,
      min_storage_days: form.minDays,
      ...(temperatures.temp_min_c !== undefined && { temp_min_c: temperatures.temp_min_c }),
      ...(temperatures.temp_max_c !== undefined && { temp_max_c: temperatures.temp_max_c }),
      ...(form.backupPower !== undefined && { has_backup_power: form.backupPower }),
    },
    errors,
  );
};

export const readProduce = (form: ProduceForm): Read<Pick<CreateProviderBody, 'category_ids'>> =>
  isValid('category_ids', form.categoryIds)
    ? { body: { category_ids: form.categoryIds } }
    : { errors: { category_ids: 'categoriesMissing' } };
