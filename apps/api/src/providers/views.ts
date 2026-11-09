import {
  maskPhone,
  type OwnProvider,
  type ProviderPhoto,
  type PublicProvider,
} from '@coldlink/shared';
import type { PhotoStorage } from '../storage/photoStorage.js';
import type { ProviderRecord } from './store.js';

/** A photo's id is the last segment of its storage path. */
export function photoId(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function photoPath(providerId: string, id: string): string {
  return `providers/${providerId}/${id}`;
}

function toPhotos(paths: string[], storage: PhotoStorage): ProviderPhoto[] {
  return paths.map((path) => ({ id: photoId(path), url: storage.publicUrl(path) }));
}

export function toPublicProvider(provider: ProviderRecord, storage: PhotoStorage): PublicProvider {
  return {
    id: provider.id,
    display_name: provider.display_name,
    business_name: provider.business_name,
    facility_type: provider.facility_type,
    description: provider.description,
    address_text: provider.address_text,
    landmark: provider.landmark,
    lga: provider.lga,
    lat: provider.lat,
    lng: provider.lng,
    capacity_total: provider.capacity_total,
    capacity_unit: provider.capacity_unit,
    price_per_unit_per_day_kobo: provider.price_per_unit_per_day_kobo,
    min_storage_days: provider.min_storage_days,
    temp_min_c: provider.temp_min_c,
    temp_max_c: provider.temp_max_c,
    has_backup_power: provider.has_backup_power,
    is_accepting_bookings: provider.is_accepting_bookings,
    avg_rating: provider.avg_rating,
    rating_count: provider.rating_count,
    photos: toPhotos(provider.photos, storage),
    categories: provider.categories,
  };
}

export function toOwnProvider(provider: ProviderRecord, storage: PhotoStorage): OwnProvider {
  return {
    ...toPublicProvider(provider, storage),
    phone_masked: maskPhone(provider.phone),
    whatsapp_masked: provider.whatsapp === null ? null : maskPhone(provider.whatsapp),
    verification_status: provider.verification_status,
    verified_at: provider.verified_at?.toISOString() ?? null,
    created_at: provider.created_at.toISOString(),
    updated_at: provider.updated_at.toISOString(),
  };
}
