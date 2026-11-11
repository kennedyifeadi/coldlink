import * as z from 'zod';
import { searchBodySchema, type BookingQuoteBody } from '@coldlink/shared';

// What a result's Book button hands to the booking screens: the provider in the path and the
// searched terms in the query, so each screen survives a reload and the sign-in redirect, which
// keeps the path and query (RequireSession). The farmer's location is not needed to book and stays
// out of the URL.
const bookingIntentSchema = searchBodySchema
  .pick({ crop_id: true, quantity: true, capacity_unit: true, days: true })
  .extend({ start_date: z.iso.date() });

export type BookingIntent = z.infer<typeof bookingIntentSchema>;

export const BOOKING_STEPS = {
  details: '/details',
  review: '/review',
  payment: '/payment',
} as const;

export type BookingStep = keyof typeof BOOKING_STEPS;

export const bookingStepPath = (step: BookingStep, providerId: string, intent: BookingIntent) => {
  const query = new URLSearchParams({
    crop: intent.crop_id,
    quantity: String(intent.quantity),
    unit: intent.capacity_unit,
    days: String(intent.days),
    start: intent.start_date,
  });
  return `${BOOKING_STEPS[step]}/${encodeURIComponent(providerId)}?${query.toString()}`;
};

export const facilityPath = (providerId: string, intent: BookingIntent) =>
  bookingStepPath('details', providerId, intent);

/** The terms `bookingStepPath` wrote, or `undefined` when the query is missing or edited into nonsense. */
export const readBookingIntent = (query: URLSearchParams): BookingIntent | undefined => {
  const number = (name: string) => {
    const value = query.get(name);
    return value === null || value.trim() === '' ? undefined : Number(value);
  };
  return bookingIntentSchema.safeParse({
    crop_id: query.get('crop') ?? undefined,
    quantity: number('quantity'),
    capacity_unit: query.get('unit') ?? undefined,
    days: number('days'),
    start_date: query.get('start') ?? undefined,
  }).data;
};

export interface BookingRoute {
  providerId: string;
  intent: BookingIntent;
}

/** The provider and terms in a booking screen's URL, or `undefined` when either was edited. */
export const readBookingRoute = (
  providerId: string | undefined,
  query: URLSearchParams,
): BookingRoute | undefined => {
  if (providerId === undefined || !z.uuid().safeParse(providerId).success) return undefined;
  const intent = readBookingIntent(query);
  return intent && { providerId, intent };
};

/** The quote's body. It has no crop: the quote prices space, and its schema refuses extra keys. */
export const quoteBodyFor = ({ providerId, intent }: BookingRoute): BookingQuoteBody => ({
  provider_id: providerId,
  quantity: intent.quantity,
  capacity_unit: intent.capacity_unit,
  days: intent.days,
  start_date: intent.start_date,
});

/**
 * Where a signed-out farmer who reached payment comes back to after signing in: the review of the
 * same booking, so they see the price again before paying.
 */
export const paymentReturnPath = ({ pathname, search }: { pathname: string; search: string }) =>
  `${pathname.replace(BOOKING_STEPS.payment, BOOKING_STEPS.review)}${search}`;
