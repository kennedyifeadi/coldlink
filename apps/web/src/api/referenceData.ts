import { queryOptions } from '@tanstack/react-query';
import { cropCategoriesResponseSchema, cropsResponseSchema } from '@coldlink/shared';
import { apiRequest } from './client';

// The API caches crops and categories for five minutes (decision 49).
const CROPS_STALE_MS = 5 * 60_000;

export const fetchCrops = (signal?: AbortSignal) =>
  apiRequest('/crops', { schema: cropsResponseSchema, signal });

export const cropsQuery = queryOptions({
  queryKey: ['crops'],
  queryFn: ({ signal }) => fetchCrops(signal),
  staleTime: CROPS_STALE_MS,
});

export const cropCategoriesQuery = queryOptions({
  queryKey: ['crop-categories'],
  queryFn: ({ signal }) =>
    apiRequest('/crop-categories', { schema: cropCategoriesResponseSchema, signal }),
  staleTime: CROPS_STALE_MS,
});
