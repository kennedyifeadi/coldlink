import {
  cropCategoriesResponseSchema,
  ownProviderSchema,
  type CreateProviderBody,
  type OwnProvider,
} from '@coldlink/shared';

export const vegetables = {
  id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  slug: 'vegetables',
  name: 'Vegetables',
};
export const fruits = {
  id: '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a',
  slug: 'fruits',
  name: 'Fruits',
};
export const fish = { id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', slug: 'fish', name: 'Fish' };

export const cropCategoriesResponse = cropCategoriesResponseSchema.parse({
  data: [vegetables, fruits, fish],
});

export const PROVIDER_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

export const photoOne = {
  id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.jpg',
  url: 'https://storage.example.com/providers/onboarding/one.jpg',
};
export const photoTwo = {
  id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b.jpg',
  url: 'https://storage.example.com/providers/onboarding/two.jpg',
};

/** The owner's view the API returns for a body, parsed with the shared schema to keep it honest. */
export const ownProviderFor = (
  body: CreateProviderBody,
  overrides: Partial<OwnProvider> = {},
): OwnProvider =>
  ownProviderSchema.parse({
    id: PROVIDER_ID,
    display_name: body.display_name,
    business_name: body.business_name ?? null,
    facility_type: body.facility_type,
    description: null,
    address_text: body.address_text,
    landmark: body.landmark ?? null,
    lga: body.lga ?? null,
    lat: body.lat,
    lng: body.lng,
    capacity_total: body.capacity_total,
    capacity_unit: body.capacity_unit,
    price_per_unit_per_day_kobo: body.price_per_unit_per_day_kobo,
    min_storage_days: body.min_storage_days ?? 1,
    temp_min_c: body.temp_min_c ?? null,
    temp_max_c: body.temp_max_c ?? null,
    has_backup_power: body.has_backup_power ?? 'unknown',
    is_accepting_bookings: true,
    avg_rating: 0,
    rating_count: 0,
    photos: [],
    categories: [vegetables],
    phone_masked: '+234803***4567',
    whatsapp_masked: null,
    verification_status: 'pending',
    verified_at: null,
    created_at: '2026-11-12T09:00:00.000Z',
    updated_at: '2026-11-12T09:00:00.000Z',
    ...overrides,
  });

/** What the onboarding test types, as POST /providers should receive it. */
export const onboardingBody: CreateProviderBody = {
  display_name: 'Onboarding Test Cold Room',
  facility_type: 'cold_room',
  lat: 7.4335123,
  lng: 3.9124456,
  address_text: '3 Bodija Market Road, Ibadan',
  landmark: 'Beside the market gate',
  lga: 'Ibadan North',
  capacity_total: 40,
  capacity_unit: 'crates',
  price_per_unit_per_day_kobo: 52_550,
  min_storage_days: 2,
  temp_min_c: 2,
  temp_max_c: 8,
  has_backup_power: 'generator',
  category_ids: [vegetables.id, fruits.id],
};
