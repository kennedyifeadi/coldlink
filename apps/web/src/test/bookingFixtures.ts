import * as z from 'zod';
import {
  farmerBookingSummarySchema,
  type BookingDelivery,
  type BookingQuote,
  type DeliveryQuote,
  type FarmerDelivery,
  type FarmerBooking,
  type FarmerBookingSummary,
  type PaymentVerification,
  type PublicProvider,
} from '@coldlink/shared';
import { bookingStepPath, type BookingIntent } from '../features/booking/bookingIntent';
import { heldBookingPath } from '../features/booking/paymentFlow';
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
  delivery: null,
  ...changes,
});

/** An inbound pickup 14.5 km from Dugbe, by bike: ₦1,000 + 14.5 km × ₦100 (decision 139). */
export const pickupQuote = (changes: Partial<DeliveryQuote> = {}): DeliveryQuote => ({
  direction: 'inbound',
  distance_km: 14.5,
  vehicle_type: 'bike',
  fee_kobo: 245_000,
  earliest_date: '2026-11-10',
  latest_date: '2026-11-10',
  ...changes,
});

/** `dugbeQuote` with the pickup priced in: ₦10,500 + ₦2,450. */
export const dugbeQuoteWithPickup = (delivery = pickupQuote()): BookingQuote =>
  dugbeQuote({
    delivery_fee_kobo: delivery.fee_kobo,
    total_charged_online_kobo: 1_050_000 + delivery.fee_kobo,
    delivery,
  });

export const dugbePaymentPath = bookingStepPath('payment', dugbe.provider.id, tenCratesForAWeek);

export const DUGBE_BOOKING_ID = '6b1f0c2e-8d4a-4e7b-9c3f-2a5d8e1b7f40';
export const dugbeHeldPaymentPath = heldBookingPath(
  { providerId: dugbe.provider.id, intent: tenCratesForAWeek },
  DUGBE_BOOKING_ID,
);

/** The booking POST /bookings makes from `dugbeQuote`: held until 10:30 in Lagos on 10 Nov. */
export const dugbeBooking = (changes: Partial<FarmerBooking> = {}): FarmerBooking => ({
  id: DUGBE_BOOKING_ID,
  code: 'CL-7KQ2M',
  status: 'payment_pending',
  provider: {
    id: dugbe.provider.id,
    display_name: dugbeProvider.display_name,
    lga: dugbeProvider.lga,
    address_text: dugbeProvider.address_text,
    landmark: dugbeProvider.landmark,
    phone: null,
  },
  crop: { id: tomatoes.id, name: tomatoes.name },
  quantity: 10,
  capacity_unit: 'crates',
  start_date: '2026-11-10',
  duration_days: 7,
  end_date: '2026-11-17',
  unit_price_kobo: 50_000,
  storage_subtotal_kobo: 3_500_000,
  deposit_kobo: 1_050_000,
  service_fee_kobo: 0,
  delivery_fee_kobo: 0,
  total_charged_online_kobo: 1_050_000,
  balance_due_kobo: 2_450_000,
  payment_expires_at: '2026-11-10T09:30:00.000Z',
  provider_response_due_at: null,
  checked_in_at: null,
  collected_at: null,
  cancelled_by: null,
  cancel_reason: null,
  created_at: '2026-11-10T09:00:00.000Z',
  status_history: [{ status: 'payment_pending', at: '2026-11-10T09:00:00.000Z' }],
  cancellation: { allowed: false },
  rating: null,
  deliveries: [],
  ...changes,
});

/** Paid at 10:05 in Lagos; the provider has until 12:05 to answer. */
export const paidDugbeBooking = (changes: Partial<FarmerBooking> = {}) =>
  dugbeBooking({
    status: 'pending_provider',
    provider_response_due_at: '2026-11-10T11:05:00.000Z',
    status_history: [
      { status: 'payment_pending', at: '2026-11-10T09:00:00.000Z' },
      { status: 'pending_provider', at: '2026-11-10T09:05:00.000Z' },
    ],
    cancellation: { allowed: true, refund_kobo: 1_050_000, deposit_refund_ends_at: null },
    ...changes,
  });

// Not strict, so the detail's extra fields are dropped rather than refused.
const summaryFields = z.object(farmerBookingSummarySchema.shape);

/** The booking as GET /bookings lists it. */
export const summaryOf = (booking: FarmerBooking): FarmerBookingSummary => {
  const { id, display_name, lga } = booking.provider;
  return summaryFields.parse({ ...booking, provider: { id, display_name, lga } });
};

export const PAYMENT_REFERENCE = 'CLP-0123456789abcdef0123';
export const CHECKOUT_URL = 'https://checkout.paystack.com/abc123xyz';
export const paymentReturnPath = `/payment/return?reference=${PAYMENT_REFERENCE}`;

export const verification = (changes: Partial<PaymentVerification> = {}): PaymentVerification => ({
  reference: PAYMENT_REFERENCE,
  payment_status: 'success',
  booking_id: DUGBE_BOOKING_ID,
  booking_status: 'pending_provider',
  delivery_request_id: null,
  ...changes,
});

export const DELIVERY_ID = '8c7d6e5f-4a3b-4c2d-9e1f-0a9b8c7d6e5f';

/** A delivery as the full booking lists it: Dugbe's pickup, paid with the booking. */
export const bookingDelivery = (changes: Partial<BookingDelivery> = {}): BookingDelivery => ({
  id: DELIVERY_ID,
  direction: 'inbound',
  status: 'requested',
  paid: true,
  scheduled_for: '2026-11-10',
  fee_kobo: 245_000,
  ...changes,
});

/** The same delivery as GET /deliveries/:id gives it. */
export const farmerDelivery = (changes: Partial<FarmerDelivery> = {}): FarmerDelivery => ({
  id: DELIVERY_ID,
  booking_id: DUGBE_BOOKING_ID,
  direction: 'inbound',
  status: 'requested',
  paid: true,
  pickup_text: 'Akinyele farm road, by the blue gate',
  pickup_location: { lat: 7.5, lng: 3.9 },
  dropoff_text: `${dugbeProvider.display_name}, ${dugbeProvider.address_text}`,
  dropoff_location: { lat: 7.4, lng: 3.9 },
  contact_name: 'Bola',
  contact_phone_masked: '+234800***3456',
  load_description: 'Tomatoes',
  load_quantity: 10,
  load_unit: 'crates',
  distance_km: 14.5,
  vehicle_type: 'bike',
  fee_kobo: 245_000,
  scheduled_for: '2026-11-10',
  handover_code: '0427',
  assigned_at: null,
  picked_up_at: null,
  delivered_at: null,
  created_at: '2026-11-10T09:00:00.000Z',
  cancellation: { allowed: true, refund_kobo: 245_000 },
  ...changes,
});
