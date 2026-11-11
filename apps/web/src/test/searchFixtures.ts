import type {
  Crop,
  FacilityType,
  PublicProvider,
  SearchResponse,
  SearchResult,
} from '@coldlink/shared';

export const tomatoes: Crop = {
  id: '6a1f3c2e-8b4d-4e5f-9a0b-1c2d3e4f5a6b',
  name: 'Tomatoes',
  local_names: [],
  category_id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  category_slug: 'vegetables',
};

export const peppers: Crop = {
  id: '7b2a4d3f-9c5e-4f60-8b1c-2d3e4f5a6b7c',
  name: 'Peppers',
  local_names: ['tatashe', 'rodo', 'shombo'],
  category_id: tomatoes.category_id,
  category_slug: 'vegetables',
};

export const freshFish: Crop = {
  id: '8c3b5e4a-0d6f-4a71-9c2d-3e4f5a6b7c8d',
  name: 'Fresh fish',
  local_names: ['eja'],
  category_id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  category_slug: 'fish',
};

export const cropsResponse = { data: [tomatoes, peppers, freshFish] };

interface ResultOptions {
  id: string;
  name: string;
  facilityType?: FacilityType;
  distanceKm: number;
  available: number;
  capacityTotal?: number;
  totalKobo: number;
  depositKobo: number;
  rating?: number;
  ratingCount?: number;
}

const provider = (options: ResultOptions): PublicProvider => ({
  id: options.id,
  display_name: options.name,
  business_name: null,
  facility_type: options.facilityType ?? 'cold_room',
  description: null,
  address_text: 'Sample address',
  landmark: null,
  lga: null,
  lat: 7.39,
  lng: 3.89,
  capacity_total: options.capacityTotal ?? 200,
  capacity_unit: 'crates',
  price_per_unit_per_day_kobo: 50000,
  min_storage_days: 1,
  temp_min_c: null,
  temp_max_c: null,
  has_backup_power: 'generator',
  is_accepting_bookings: true,
  avg_rating: options.rating ?? 0,
  rating_count: options.ratingCount ?? 0,
  photos: [],
  categories: [],
});

export const searchResult = (options: ResultOptions): SearchResult => ({
  provider: provider(options),
  distance_km: options.distanceKm,
  available_quantity: options.available,
  storage_subtotal_kobo: options.totalKobo,
  service_fee_kobo: 0,
  total_estimate_kobo: options.totalKobo,
  deposit_kobo: options.depositKobo,
});

export const dugbe = searchResult({
  id: '9d4c6f5b-1e7a-4b82-8d3e-4f5a6b7c8d9e',
  name: 'Dugbe Fridge Fleet (Sample)',
  facilityType: 'fridge_fleet',
  distanceKm: 5.8,
  available: 40,
  capacityTotal: 40,
  totalKobo: 3_500_000,
  depositKobo: 1_050_000,
  rating: 4.5,
  ratingCount: 12,
});

export const apata = searchResult({
  id: '0e5d7a6c-2f8b-4c93-9e4f-5a6b7c8d9e0f',
  name: 'Apata Cold Store (Sample)',
  distanceKm: 9.9,
  available: 15,
  capacityTotal: 200,
  totalKobo: 2_800_000,
  depositKobo: 840_000,
});

export const searchResponse = (
  data: SearchResult[],
  { expanded = false }: { expanded?: boolean } = {},
): SearchResponse => ({
  data,
  expanded_radius: expanded,
  radius_km: expanded ? 100 : 25,
  start_date: '2026-11-10',
  end_date: '2026-11-17',
});
