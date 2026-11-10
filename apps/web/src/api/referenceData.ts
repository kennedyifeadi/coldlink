import { cropsResponseSchema } from '@coldlink/shared';
import { apiRequest } from './client';

export const fetchCrops = (signal?: AbortSignal) =>
  apiRequest('/crops', { schema: cropsResponseSchema, signal });
