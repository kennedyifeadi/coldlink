import { describe, expect, it } from 'vitest';
import {
  emptyForms,
  readCapacity,
  readContact,
  readLocation,
  readProduce,
  type CapacityForm,
  type ContactForm,
} from './providerForm';

const contact = (changes: Partial<ContactForm>): ContactForm => ({
  ...emptyForms.contact,
  displayName: 'Onboarding Test Cold Room',
  facilityType: 'cold_room',
  ...changes,
});

const capacity = (changes: Partial<CapacityForm>): CapacityForm => ({
  ...emptyForms.capacity,
  capacity: '40',
  unit: 'crates',
  price: '500',
  ...changes,
});

describe('readContact', () => {
  it('leaves the phone out for the own number and blank optional fields out', () => {
    expect(readContact(contact({ businessName: '  ', whatsapp: '' }))).toEqual({
      body: { display_name: 'Onboarding Test Cold Room', facility_type: 'cold_room' },
    });
  });

  it('sends another number as the shared schema normalises it', () => {
    expect(
      readContact(contact({ useOwnPhone: false, phone: '0803 000 0995', whatsapp: '8031234567' })),
    ).toMatchObject({ body: { phone: '+2348030000995', whatsapp: '+2348031234567' } });
  });

  it('trims the names', () => {
    expect(readContact(contact({ displayName: '  Bodija Cold Room ' }))).toMatchObject({
      body: { display_name: 'Bodija Cold Room' },
    });
  });

  it('tells a missing name from one that is too long', () => {
    expect(readContact(contact({ displayName: ' ' }))).toEqual({
      errors: { display_name: 'displayNameMissing' },
    });
    expect(readContact(contact({ displayName: 'x'.repeat(81) }))).toEqual({
      errors: { display_name: 'displayNameTooLong' },
    });
  });
});

describe('readLocation', () => {
  const location = { ...emptyForms.location, address: '3 Bodija Market Road' };

  it('keeps the pin exactly as placed', () => {
    expect(readLocation({ ...location, pin: { lat: 7.4335123, lng: 3.9124456 } })).toEqual({
      body: { lat: 7.4335123, lng: 3.9124456, address_text: '3 Bodija Market Road' },
    });
  });

  it('needs a pin', () => {
    expect(readLocation(location)).toEqual({ errors: { lat: 'pinMissing' } });
  });
});

describe('readCapacity', () => {
  it('converts the naira price to kobo, allowing thousands separators', () => {
    expect(readCapacity(capacity({ price: '1,525.5' }))).toMatchObject({
      body: { price_per_unit_per_day_kobo: 152_550 },
    });
  });

  it('refuses a price finer than a kobo, or none', () => {
    expect(readCapacity(capacity({ price: '525.555' }))).toEqual({
      errors: { price_per_unit_per_day_kobo: 'priceTooPrecise' },
    });
    expect(readCapacity(capacity({ price: 'five' }))).toEqual({
      errors: { price_per_unit_per_day_kobo: 'priceMissing' },
    });
    expect(readCapacity(capacity({ price: '-1' }))).toEqual({
      errors: { price_per_unit_per_day_kobo: 'priceNotPositive' },
    });
  });

  it('takes capacity to 3 decimal places, as quantities are', () => {
    expect(readCapacity(capacity({ capacity: '12.125' }))).toMatchObject({
      body: { capacity_total: 12.125 },
    });
    expect(readCapacity(capacity({ capacity: '12.1255' }))).toEqual({
      errors: { capacity_total: 'capacityTooPrecise' },
    });
  });

  it('sends temperatures only when given, and in order', () => {
    expect(readCapacity(capacity({}))).toEqual({
      body: {
        capacity_total: 40,
        capacity_unit: 'crates',
        price_per_unit_per_day_kobo: 50_000,
        min_storage_days: 1,
      },
    });
    expect(readCapacity(capacity({ tempMin: '-2', tempMax: '-2' }))).toMatchObject({
      body: { temp_min_c: -2, temp_max_c: -2 },
    });
    expect(readCapacity(capacity({ tempMin: '8', tempMax: '2' }))).toEqual({
      errors: { temp_max_c: 'temperatureOrder' },
    });
    expect(readCapacity(capacity({ tempMax: '41' }))).toEqual({
      errors: { temp_max_c: 'temperatureInvalid' },
    });
  });
});

describe('readProduce', () => {
  it('needs at least one category', () => {
    expect(readProduce({ categoryIds: [] })).toEqual({
      errors: { category_ids: 'categoriesMissing' },
    });
  });
});
