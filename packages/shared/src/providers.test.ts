import { describe, expect, it } from 'vitest';
import {
  createProviderBodySchema,
  providerPhotoIdSchema,
  updateProviderBodySchema,
} from './providers.js';

const categoryId = '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f';

const validCreate = {
  display_name: '  Bodija Cold Room  ',
  facility_type: 'cold_room',
  address_text: '12 Bodija Market Road',
  lat: 7.4352,
  lng: 3.9133,
  capacity_total: 40,
  capacity_unit: 'sqm',
  price_per_unit_per_day_kobo: 225_800,
  category_ids: [categoryId],
};

describe('createProviderBodySchema', () => {
  it('trims text and normalises phone numbers', () => {
    expect(
      createProviderBodySchema.parse({
        ...validCreate,
        phone: '0803 123 4567',
        whatsapp: '8051234567',
      }),
    ).toEqual({
      ...validCreate,
      display_name: 'Bodija Cold Room',
      phone: '+2348031234567',
      whatsapp: '+2348051234567',
    });
  });

  it('leaves the phone out when none is sent', () => {
    expect(createProviderBodySchema.parse(validCreate).phone).toBeUndefined();
  });

  it.each([
    ['a price in naira with kobo fractions', { price_per_unit_per_day_kobo: 2258.5 }],
    ['a price of 0', { price_per_unit_per_day_kobo: 0 }],
    ['a capacity of 0', { capacity_total: 0 }],
    ['a capacity with 4 decimal places', { capacity_total: 1.2345 }],
    ['no categories', { category_ids: [] }],
    ['a category twice', { category_ids: [categoryId, categoryId] }],
    ['an unknown facility type', { facility_type: 'warehouse' }],
    ['a landline', { phone: '02 123 4567' }],
    ['a blank display name', { display_name: '   ' }],
    ['a latitude past 90', { lat: 91 }],
    ['temperatures out of order', { temp_min_c: 8, temp_max_c: 2 }],
    ['a moderation field', { verification_status: 'approved' }],
    ['photos', { photos: ['x.jpg'] }],
  ])('rejects %s', (_name, change) => {
    expect(createProviderBodySchema.safeParse({ ...validCreate, ...change }).success).toBe(false);
  });

  it('accepts a capacity with 3 decimal places', () => {
    expect(createProviderBodySchema.parse({ ...validCreate, capacity_total: 1.005 })).toMatchObject(
      { capacity_total: 1.005 },
    );
  });
});

describe('updateProviderBodySchema', () => {
  it('accepts a single field', () => {
    expect(updateProviderBodySchema.parse({ price_per_unit_per_day_kobo: 250_000 })).toEqual({
      price_per_unit_per_day_kobo: 250_000,
    });
  });

  it('accepts null to clear an optional field', () => {
    expect(updateProviderBodySchema.parse({ description: null, whatsapp: null })).toEqual({
      description: null,
      whatsapp: null,
    });
  });

  it.each([
    ['an empty body', {}],
    ['lat without lng', { lat: 7.4 }],
    ['null for a required column', { display_name: null }],
    ['the owner', { owner_user_id: categoryId }],
    ['the rating', { avg_rating: 5 }],
    ['temperatures out of order', { temp_min_c: 8, temp_max_c: 2 }],
  ])('rejects %s', (_name, body) => {
    expect(updateProviderBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('providerPhotoIdSchema', () => {
  it('accepts a UUID file name with an image extension', () => {
    expect(
      providerPhotoIdSchema.safeParse('6f1c1a8e-0c4b-4f5e-9a3d-2b7e8c9d0a1f.webp').success,
    ).toBe(true);
  });

  it.each(['../secrets.jpg', '6f1c1a8e-0c4b-4f5e-9a3d-2b7e8c9d0a1f.svg', 'photo.jpg'])(
    'rejects %s',
    (id) => {
      expect(providerPhotoIdSchema.safeParse(id).success).toBe(false);
    },
  );
});
