import { queryOptions } from '@tanstack/react-query';
import {
  ownProviderSchema,
  ownProvidersResponseSchema,
  type CreateProviderBody,
} from '@coldlink/shared';
import { isApiError } from './client';
import type { SessionStore } from '../session/sessionStore';

type AuthorizedRequest = SessionStore['authorizedRequest'];

const providerPath = (providerId: string) => `/providers/${encodeURIComponent(providerId)}`;

export const createProvider = (request: AuthorizedRequest, body: CreateProviderBody) =>
  request('/providers', { method: 'POST', body, schema: ownProviderSchema });

/** One photo as the raw body, typed by the Blob (decision 66). */
export const uploadProviderPhoto = (request: AuthorizedRequest, providerId: string, photo: Blob) =>
  request(`${providerPath(providerId)}/photos`, {
    method: 'POST',
    body: photo,
    schema: ownProviderSchema,
  });

export const removeProviderPhoto = (
  request: AuthorizedRequest,
  providerId: string,
  photoId: string,
) =>
  request(`${providerPath(providerId)}/photos/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
    schema: ownProviderSchema,
  });

export const OWN_PROVIDERS_KEY = ['providers', 'mine'] as const;

// The route needs the provider role, so a user who has never listed a facility gets a 403: for
// them that means no facilities yet. Asking anyway, rather than reading the roles in the session,
// keeps a just-created facility listed while the session still carries the old roles.
export const ownProvidersQuery = (request: AuthorizedRequest) =>
  queryOptions({
    queryKey: OWN_PROVIDERS_KEY,
    queryFn: async ({ signal }) => {
      try {
        const { data } = await request('/providers/mine', {
          schema: ownProvidersResponseSchema,
          signal,
        });
        return data;
      } catch (error) {
        if (isApiError(error, 'forbidden')) return [];
        throw error;
      }
    },
  });
