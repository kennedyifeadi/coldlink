import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  providerBookingDetailSchema,
  providerBookingSchema,
  providerBookingsResponseSchema,
  providerDashboardSchema,
  providerPayoutsResponseSchema,
  type ProviderBookingGroup,
} from '@coldlink/shared';
import type { SessionStore } from '../session/sessionStore';

type AuthorizedRequest = SessionStore['authorizedRequest'];

const facilityPath = (providerId: string) => `/providers/${encodeURIComponent(providerId)}`;

/** Every read of one facility's bookings, so an action can refresh them all at once. */
export const facilityKey = (providerId: string) => ['provider', providerId] as const;

// None is cached as fresh: farmers pay, and the expiry job moves bookings, while the screen is open.
export const providerDashboardQuery = (request: AuthorizedRequest, providerId: string) =>
  queryOptions({
    queryKey: [...facilityKey(providerId), 'dashboard'] as const,
    queryFn: ({ signal }) =>
      request(`${facilityPath(providerId)}/dashboard`, {
        schema: providerDashboardSchema,
        signal,
      }),
  });

export const providerBookingsQuery = (
  request: AuthorizedRequest,
  providerId: string,
  group: ProviderBookingGroup,
) =>
  infiniteQueryOptions({
    queryKey: [...facilityKey(providerId), 'bookings', group] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams({ group });
      if (pageParam !== undefined) query.set('cursor', pageParam);
      return request(`${facilityPath(providerId)}/bookings?${query.toString()}`, {
        schema: providerBookingsResponseSchema,
        signal,
      });
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });

export const providerPayoutsQuery = (request: AuthorizedRequest, providerId: string) =>
  infiniteQueryOptions({
    queryKey: [...facilityKey(providerId), 'payouts'] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const query = pageParam === undefined ? '' : `?cursor=${encodeURIComponent(pageParam)}`;
      return request(`${facilityPath(providerId)}/payouts${query}`, {
        schema: providerPayoutsResponseSchema,
        signal,
      });
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });

export const providerBookingQuery = (
  request: AuthorizedRequest,
  providerId: string,
  bookingId: string,
) =>
  queryOptions({
    queryKey: [...facilityKey(providerId), 'booking', bookingId] as const,
    queryFn: ({ signal }) =>
      request(`${facilityPath(providerId)}/bookings/${encodeURIComponent(bookingId)}`, {
        schema: providerBookingDetailSchema,
        signal,
      }),
  });

export const providerBookingActions = ['accept', 'reject', 'check-in', 'collect'] as const;
export type ProviderBookingAction = (typeof providerBookingActions)[number];

// No body for reject: the reason is optional and the screen does not ask for one.
export const actOnBooking = (
  request: AuthorizedRequest,
  bookingId: string,
  action: ProviderBookingAction,
) =>
  request(`/bookings/${encodeURIComponent(bookingId)}/${action}`, {
    method: 'POST',
    schema: providerBookingSchema,
  });
