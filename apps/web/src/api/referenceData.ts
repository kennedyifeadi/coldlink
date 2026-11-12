import { queryOptions } from '@tanstack/react-query';
import { cropsResponseSchema } from '@coldlink/shared';
import { apiRequest } from './client';

// The API caches crops for five minutes (decision 49).
const CROPS_STALE_MS = 5 * 60_000;

export const fetchCrops = (signal?: AbortSignal) =>
  apiRequest('/crops', { schema: cropsResponseSchema, signal });

export const cropsQuery = queryOptions({
  queryKey: ['crops'],
  queryFn: ({ signal }) => fetchCrops(signal),
  staleTime: CROPS_STALE_MS,
});
