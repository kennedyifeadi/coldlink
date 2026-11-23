import * as z from 'zod';
import { bookingStatusChangeSchema } from './bookings.js';
import { capacityUnitSchema, type BookingStatus } from './enums.js';
import { koboSchema } from './money.js';
import { providerBookingSchema } from './providerBookings.js';

// The provider's dashboard and booking reads (PRD 7.2, 9.5). Every booking in them is a
// providerBookingSchema, so none carries the farmer's name or phone (PRD 10).

export const providerBookingGroups = ['requests', 'upcoming', 'in_storage', 'past'] as const;
export type ProviderBookingGroup = (typeof providerBookingGroups)[number];
export const providerBookingGroupSchema = z.enum(providerBookingGroups);

/** The statuses each group holds; together they are every status a provider is asked about. */
export const providerBookingGroupStatuses = {
  requests: ['pending_provider'],
  upcoming: ['confirmed'],
  in_storage: ['in_storage'],
  past: ['completed', 'rejected', 'expired', 'cancelled', 'no_show'],
} as const satisfies Record<ProviderBookingGroup, readonly BookingStatus[]>;

/** The group a booking in `status` is listed under, or undefined for `payment_pending`. */
export function providerBookingGroupOf(status: BookingStatus): ProviderBookingGroup | undefined {
  return providerBookingGroups.find((group) =>
    (providerBookingGroupStatuses[group] as readonly BookingStatus[]).includes(status),
  );
}

export const PROVIDER_BOOKINGS_DEFAULT_LIMIT = 20;
export const PROVIDER_BOOKINGS_MAX_LIMIT = 50;
/** How many bookings each dashboard list shows; the counts say how many there are in all. */
export const PROVIDER_DASHBOARD_LIST_LIMIT = 5;

export const providerBookingsQuerySchema = z.strictObject({
  group: providerBookingGroupSchema,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PROVIDER_BOOKINGS_MAX_LIMIT)
    .default(PROVIDER_BOOKINGS_DEFAULT_LIMIT),
  /** The `next_cursor` of the page before: the id of its last booking. */
  cursor: z.uuid().optional(),
});
export type ProviderBookingsQuery = z.input<typeof providerBookingsQuerySchema>;
export type ProviderBookingsQueryInput = z.output<typeof providerBookingsQuerySchema>;

export const providerBookingsResponseSchema = z.strictObject({
  data: z.array(providerBookingSchema),
  /** Null on the last page. */
  next_cursor: z.uuid().nullable(),
});
export type ProviderBookingsResponse = z.infer<typeof providerBookingsResponseSchema>;

/** One booking in full: the action response plus when it entered each status (decision 106). */
export const providerBookingDetailSchema = providerBookingSchema.safeExtend({
  status_history: z.array(bookingStatusChangeSchema),
});
export type ProviderBookingDetail = z.infer<typeof providerBookingDetailSchema>;

const quantitySchema = z.number().nonnegative();

const dashboardListSchema = z.strictObject({
  count: z.int().nonnegative(),
  /** The first few, in the group's own order. */
  items: z.array(providerBookingSchema).max(PROVIDER_DASHBOARD_LIST_LIMIT),
});
export type ProviderDashboardList = z.infer<typeof dashboardListSchema>;

export const providerDashboardSchema = z.strictObject({
  provider: z.strictObject({ id: z.uuid(), display_name: z.string() }),
  /** Space booked today in Lagos, in the facility's own unit. */
  occupancy: z.strictObject({
    date: z.iso.date(),
    used: quantitySchema,
    total: quantitySchema,
    capacity_unit: capacityUnitSchema,
  }),
  requests: dashboardListSchema,
  upcoming: dashboardListSchema,
  in_storage: dashboardListSchema,
  /** Sums of the facility's payouts (PRD 5.8). */
  earnings: z.strictObject({
    owed_kobo: koboSchema.nonnegative(),
    paid_kobo: koboSchema.nonnegative(),
  }),
});
export type ProviderDashboard = z.infer<typeof providerDashboardSchema>;
