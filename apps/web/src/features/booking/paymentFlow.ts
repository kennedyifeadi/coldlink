import * as z from 'zod';
import {
  paymentReferenceSchema,
  type BookingStatus,
  type FarmerBooking,
  type PaymentStatus,
} from '@coldlink/shared';
import { bookingStepPath, type BookingRoute } from './bookingIntent';

/** Where Paystack sends the farmer after checkout: `WEB_APP_URL` + this (decision 92). */
export const PAYMENT_RETURN_PATH = '/payment/return';
export const CONFIRMATION_PATH = '/confirmation';

const BOOKING_PARAM = 'booking';

/**
 * The payment screen for a booking already made. The id stays in the URL, so a reload or a back
 * press from Paystack pays the same booking instead of making another.
 */
export const heldBookingPath = (route: BookingRoute, bookingId: string) =>
  `${bookingStepPath('payment', route.providerId, route.intent)}&${BOOKING_PARAM}=${encodeURIComponent(bookingId)}`;

/** The id `heldBookingPath` wrote; `null` when there is none, `undefined` when it was edited. */
export const readHeldBookingId = (query: URLSearchParams): string | null | undefined => {
  const value = query.get(BOOKING_PARAM);
  if (value === null) return null;
  return z.uuid().safeParse(value).data;
};

export const readPaymentReference = (query: URLSearchParams) =>
  paymentReferenceSchema.safeParse(query.get('reference')).data;

export const confirmationPath = (bookingId: string) =>
  `${CONFIRMATION_PATH}/${encodeURIComponent(bookingId)}`;

const UNPAID_STATUSES = new Set<BookingStatus>(['payment_pending', 'expired']);
const PAID_STATUSES = new Set<PaymentStatus>(['success', 'refunded', 'partially_refunded']);

/** Whether the booking is still waiting for payment with its space held, by this clock. */
export const holdIsRunning = (booking: FarmerBooking, now: number) =>
  booking.status === 'payment_pending' &&
  booking.payment_expires_at !== null &&
  Date.parse(booking.payment_expires_at) > now;

export type ReturnOutcome = 'paid' | 'notFinished' | 'holdExpired' | 'lateRefund';

/** What a return from Paystack means for the farmer, from the charge and the booking it pays. */
export const readReturnOutcome = (
  paymentStatus: PaymentStatus,
  booking: FarmerBooking,
  now: number,
): ReturnOutcome => {
  // The booking moved on, whichever charge paid it.
  if (!UNPAID_STATUSES.has(booking.status)) return 'paid';
  // Paid, but the booking never took it: a late payment, refunded in full (decision 94).
  if (PAID_STATUSES.has(paymentStatus)) return 'lateRefund';
  return holdIsRunning(booking, now) ? 'notFinished' : 'holdExpired';
};

/** Statuses in which the booking has been paid for and still stands. */
export const isPaidAndStanding = (status: BookingStatus) =>
  status === 'pending_provider' ||
  status === 'confirmed' ||
  status === 'in_storage' ||
  status === 'completed';

/** A WhatsApp share link for any chat; the text is the caller's. */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
