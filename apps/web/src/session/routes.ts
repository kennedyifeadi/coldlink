import * as z from 'zod';

export const SIGN_IN_PATH = '/onboarding';
export const SIGNED_IN_HOME = '/';
export const MY_BOOKINGS_PATH = '/bookings';
export const PROVIDER_ONBOARDING_PATH = '/provider/onboarding';

/** Router state a guard leaves for the sign-in screen, to come back after signing in. */
export const returnToStateSchema = z.object({ returnTo: z.string().startsWith('/') });
export type ReturnToState = z.infer<typeof returnToStateSchema>;

export const bookingDetailPath = (bookingId: string) =>
  `${MY_BOOKINGS_PATH}/${encodeURIComponent(bookingId)}`;

/** A facility's dashboard, its bookings and one booking, under its id. */
export const PROVIDER_FACILITY_PATH = '/provider/facilities/:providerId';
export const PROVIDER_BOOKINGS_PATH = `${PROVIDER_FACILITY_PATH}/bookings`;
export const PROVIDER_BOOKING_PATH = `${PROVIDER_BOOKINGS_PATH}/:bookingId`;
export const PROVIDER_SETTINGS_PATH = `${PROVIDER_FACILITY_PATH}/settings`;
export const PROVIDER_EARNINGS_PATH = `${PROVIDER_FACILITY_PATH}/earnings`;

export const providerDashboardPath = (providerId: string) =>
  `/provider/facilities/${encodeURIComponent(providerId)}`;

export const providerBookingsPath = (providerId: string, group?: string) =>
  `${providerDashboardPath(providerId)}/bookings${group === undefined ? '' : `?group=${group}`}`;

export const providerBookingPath = (providerId: string, bookingId: string) =>
  `${providerDashboardPath(providerId)}/bookings/${encodeURIComponent(bookingId)}`;

export const providerSettingsPath = (providerId: string) =>
  `${providerDashboardPath(providerId)}/settings`;

export const providerEarningsPath = (providerId: string) =>
  `${providerDashboardPath(providerId)}/earnings`;
