import * as z from 'zod';
import { searchBodySchema } from '@coldlink/shared';

// What a result's Book button hands to the facility screen: the provider in the path and the
// searched terms in the query, so the screen survives a reload and the sign-in redirect, which
// keeps the path and query (RequireSession). The farmer's location is not needed to book and stays
// out of the URL.
const bookingIntentSchema = searchBodySchema
  .pick({ crop_id: true, quantity: true, capacity_unit: true, days: true })
  .extend({ start_date: z.iso.date() });

export type BookingIntent = z.infer<typeof bookingIntentSchema>;

export const facilityPath = (providerId: string, intent: BookingIntent) => {
  const query = new URLSearchParams({
    crop: intent.crop_id,
    quantity: String(intent.quantity),
    unit: intent.capacity_unit,
    days: String(intent.days),
    start: intent.start_date,
  });
  return `/details/${encodeURIComponent(providerId)}?${query.toString()}`;
};

/** The terms `facilityPath` wrote, or `undefined` when the query is missing or edited into nonsense. */
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
