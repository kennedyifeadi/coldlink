import { describe, expect, it } from 'vitest';
import { onboardingBody, ownProviderFor } from '../../test/providerFixtures';
import { readSettings, settingsFormFor, typedCapacity } from './settingsForm';

// 40 crates at ₦525.50 a day.
const provider = ownProviderFor(onboardingBody);
const form = settingsFormFor(provider);

describe('readSettings', () => {
  it('sends nothing for entries that read as the stored values', () => {
    expect(readSettings(form, provider)).toEqual({ body: {} });
    expect(readSettings({ ...form, capacity: '40.000', price: '525.50' }, provider)).toEqual({
      body: {},
    });
    expect(readSettings({ ...form, phone: '  ', whatsapp: '' }, provider)).toEqual({ body: {} });
  });

  it('sends each changed field, the price in kobo and numbers in +234 form', () => {
    expect(
      readSettings(
        { capacity: '1,250', price: '1,000.05', phone: '0805 123 0000', whatsapp: '8031112222' },
        provider,
      ),
    ).toEqual({
      body: {
        capacity_total: 1250,
        price_per_unit_per_day_kobo: 100_005,
        phone: '+2348051230000',
        whatsapp: '+2348031112222',
      },
    });
  });

  it('names every field that cannot be read, and sends nothing', () => {
    expect(
      readSettings({ capacity: '0', price: '1.001', phone: '0123', whatsapp: 'abc' }, provider),
    ).toEqual({
      errors: {
        capacity_total: 'capacityNotPositive',
        price_per_unit_per_day_kobo: 'priceTooPrecise',
        phone: 'phoneInvalid',
        whatsapp: 'whatsappInvalid',
      },
    });
    expect(readSettings({ ...form, capacity: '', price: 'ten' }, provider)).toEqual({
      errors: { capacity_total: 'capacityMissing', price_per_unit_per_day_kobo: 'priceMissing' },
    });
  });
});

describe('typedCapacity', () => {
  it('is the space typed, or undefined while it is not a valid one', () => {
    expect(typedCapacity({ ...form, capacity: '7.25' })).toBe(7.25);
    expect(typedCapacity({ ...form, capacity: '' })).toBeUndefined();
    expect(typedCapacity({ ...form, capacity: '-3' })).toBeUndefined();
  });
});
