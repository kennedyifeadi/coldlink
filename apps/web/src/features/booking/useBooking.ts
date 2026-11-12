import { useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';
import { validationIssueSchema, type BookingQuote, type PublicProvider } from '@coldlink/shared';
import { fetchProvider, quoteBooking } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { SEARCH_STEPS, useSearchFlow } from '../search/searchFlow';
import { quoteBodyFor, readBookingRoute, type BookingRoute } from './bookingIntent';

const PROVIDER_STALE_MS = 60_000;

const conflictDetailsSchema = z.object({ available_quantity: z.number().nonnegative() });
const validationDetailsSchema = z.array(validationIssueSchema);
const FARMER_FIELDS = new Set(['quantity', 'capacity_unit', 'days', 'start_date']);

/** A quote the API refused for these terms, which the farmer can fix by changing them. */
export type QuoteProblem =
  { kind: 'notEnoughSpace'; available: number } | { kind: 'invalidTerms'; message: string };

const readQuoteProblem = (error: unknown): QuoteProblem | undefined => {
  if (isApiError(error, 'conflict')) {
    const details = conflictDetailsSchema.safeParse(error.details);
    if (details.success)
      return { kind: 'notEnoughSpace', available: details.data.available_quantity };
  }
  if (isApiError(error, 'validation_failed')) {
    // The API words its messages on these fields for the farmer ("Choose today or a later date");
    // any other 400 is a fault in the request the farmer cannot fix.
    const issue = validationDetailsSchema
      .safeParse(error.details)
      .data?.find(({ path }) => FARMER_FIELDS.has(path));
    if (issue) return { kind: 'invalidTerms', message: issue.message };
  }
  return undefined;
};

export interface ReadyBooking {
  status: 'ready';
  route: BookingRoute;
  provider: PublicProvider;
  /** Undefined exactly when there is a problem. */
  quote: BookingQuote | undefined;
  problem: QuoteProblem | undefined;
}

export type BookingData =
  | { status: 'invalidLink' }
  | { status: 'loading' }
  | { status: 'gone' }
  | { status: 'failed'; error: unknown; retry: () => void; retrying: boolean }
  | ReadyBooking;

/** The facility and the API's quote for the booking in the current URL. */
export const useBooking = (): BookingData => {
  const { providerId } = useParams();
  const { search } = useLocation();
  const route = readBookingRoute(providerId, new URLSearchParams(search));

  const provider = useQuery({
    queryKey: ['provider', route?.providerId],
    queryFn: ({ signal }) => fetchProvider(route!.providerId, signal),
    enabled: route !== undefined,
    staleTime: PROVIDER_STALE_MS,
  });
  // Never cached as fresh: space and prices can change between screens, and every screen shows
  // the API's latest figures.
  const quote = useQuery({
    queryKey: ['quote', route],
    queryFn: ({ signal }) => quoteBooking(quoteBodyFor(route!), signal),
    enabled: route !== undefined,
  });

  if (!route) return { status: 'invalidLink' };
  if (isApiError(provider.error, 'not_found') || isApiError(quote.error, 'not_found')) {
    return { status: 'gone' };
  }
  const problem = readQuoteProblem(quote.error);
  const failure = provider.error ?? (problem ? null : quote.error);
  if (failure) {
    return {
      status: 'failed',
      error: failure,
      retry: () => {
        if (provider.isError) void provider.refetch();
        if (quote.isError) void quote.refetch();
      },
      retrying: provider.isFetching || quote.isFetching,
    };
  }
  if (!provider.data || quote.isPending) return { status: 'loading' };
  // A refused refetch keeps the previous figures in `quote.data`; they no longer hold.
  return {
    status: 'ready',
    route,
    provider: provider.data,
    quote: problem ? undefined : quote.data,
    problem,
  };
};

/**
 * Where "Change" goes: the search's amount step while the search is still in memory, which keeps
 * the place and produce, and the start of search after a reload (decision 87).
 */
export const useChangeAmountPath = () => {
  const { draft } = useSearchFlow();
  return draft.place && draft.crop ? SEARCH_STEPS.amount : SEARCH_STEPS.place;
};
