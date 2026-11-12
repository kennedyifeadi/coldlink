import type { BookingQuote, PublicProvider } from '@coldlink/shared';
import { bookingStepPath, type BookingIntent } from '../features/booking/bookingIntent';
import { dugbe, tomatoes } from './searchFixtures';

/** Dugbe as GET /providers/:id gives it, with what search results leave out filled in. */
export const dugbeProvider: PublicProvider = {
  ...dugbe.provider,
  address_text: '14 Dugbe Market Road, Ibadan',
  landmark: 'Opposite Cocoa House',
  lga: 'Ibadan North-West',
  temp_min_c: 2,
  temp_max_c: 8,
  has_backup_power: 'solar',
  photos: [
    {
      id: '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9.webp',
      url: 'https://storage.example.com/providers/dugbe/front.webp',
    },
    {
      id: '2a3b4c5d-6e7f-4809-9a1b-2c3d4e5f6a7b.jpg',
      url: 'https://storage.example.com/providers/dugbe/inside.jpg',
    },
  ],
  categories: [
    { id: tomatoes.category_id, slug: 'vegetables', name: 'Vegetables' },
    { id: '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a', slug: 'fruits', name: 'Fruits' },
  ],
};

export const tenCratesForAWeek: BookingIntent = {
  crop_id: tomatoes.id,
  quantity: 10,
  capacity_unit: 'crates',
  days: 7,
  start_date: '2026-11-10',
};

export const dugbeDetailsPath = bookingStepPath('details', dugbe.provider.id, tenCratesForAWeek);
export const dugbeReviewPath = bookingStepPath('review', dugbe.provider.id, tenCratesForAWeek);

/** The dev seed's quote for 10 crates at Dugbe for 7 days: ₦35,000, 30% deposit, no service fee. */
export const dugbeQuote = (changes: Partial<BookingQuote> = {}): BookingQuote => ({
  provider_id: dugbe.provider.id,
  quantity: 10,
  capacity_unit: 'crates',
  start_date: '2026-11-10',
  duration_days: 7,
  end_date: '2026-11-17',
  available_quantity: 30,
  unit_price_kobo: 50_000,
  storage_subtotal_kobo: 3_500_000,
  deposit_kobo: 1_050_000,
  balance_due_kobo: 2_450_000,
  service_fee_kobo: 0,
  delivery_fee_kobo: 0,
  total_charged_online_kobo: 1_050_000,
  ...changes,
});
