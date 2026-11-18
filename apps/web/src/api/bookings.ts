import { queryOptions } from '@tanstack/react-query';
import {
  bookingQuoteSchema,
  cancelledBookingSchema,
  farmerBookingSchema,
  farmerBookingsResponseSchema,
  initializedPaymentSchema,
  paymentVerificationSchema,
  publicProviderSchema,
  type BookingQuoteBody,
  type CreateBookingBody,
} from '@coldlink/shared';
import { apiRequest } from './client';
import type { SessionStore } from '../session/sessionStore';

type AuthorizedRequest = SessionStore['authorizedRequest'];

export const fetchProvider = (providerId: string, signal?: AbortSignal) =>
  apiRequest(`/providers/${encodeURIComponent(providerId)}`, {
    schema: publicProviderSchema,
    signal,
  });

// Open to everyone and logged nowhere (decision 75), so no token is sent: a signed-in and a
// signed-out farmer get the same quote.
export const quoteBooking = (body: BookingQuoteBody, signal?: AbortSignal) =>
  apiRequest('/bookings/quote', { method: 'POST', body, schema: bookingQuoteSchema, signal });

export const createBooking = (request: AuthorizedRequest, body: CreateBookingBody) =>
  request('/bookings', { method: 'POST', body, schema: farmerBookingSchema });

export const bookingKey = (bookingId: string) => ['booking', bookingId] as const;

// Never cached as fresh: a paid booking changes status when the provider answers.
export const bookingQuery = (request: AuthorizedRequest, bookingId: string) =>
  queryOptions({
    queryKey: bookingKey(bookingId),
    queryFn: ({ signal }) =>
      request(`/bookings/${encodeURIComponent(bookingId)}`, {
        schema: farmerBookingSchema,
        signal,
      }),
  });

export const myBookingsKey = ['bookings'] as const;

// Never cached as fresh, for the same reason as one booking.
export const myBookingsQuery = (request: AuthorizedRequest) =>
  queryOptions({
    queryKey: myBookingsKey,
    queryFn: ({ signal }) => request('/bookings', { schema: farmerBookingsResponseSchema, signal }),
  });

// No body: the reason is optional and the screen does not ask for one.
export const cancelBooking = (request: AuthorizedRequest, bookingId: string) =>
  request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
    method: 'POST',
    schema: cancelledBookingSchema,
  });

export const initializePayment = (request: AuthorizedRequest, bookingId: string) =>
  request('/payments/initialize', {
    method: 'POST',
    body: { booking_id: bookingId },
    schema: initializedPaymentSchema,
  });

export const verifyPayment = (
  request: AuthorizedRequest,
  reference: string,
  signal?: AbortSignal,
) =>
  request(`/payments/${encodeURIComponent(reference)}/verify`, {
    schema: paymentVerificationSchema,
    signal,
  });
