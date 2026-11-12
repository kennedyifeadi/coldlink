import { bookingQuoteSchema, publicProviderSchema, type BookingQuoteBody } from '@coldlink/shared';
import { apiRequest } from './client';

export const fetchProvider = (providerId: string, signal?: AbortSignal) =>
  apiRequest(`/providers/${encodeURIComponent(providerId)}`, {
    schema: publicProviderSchema,
    signal,
  });

// Open to everyone and logged nowhere (decision 75), so no token is sent: a signed-in and a
// signed-out farmer get the same quote.
export const quoteBooking = (body: BookingQuoteBody, signal?: AbortSignal) =>
  apiRequest('/bookings/quote', { method: 'POST', body, schema: bookingQuoteSchema, signal });
