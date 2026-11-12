import { searchResponseSchema, type SearchBody } from '@coldlink/shared';
import type { SessionStore } from '../session/sessionStore';
import { apiRequest } from './client';

/**
 * Search is open to everyone (decision 70). A signed-in farmer's token goes with it, so the search
 * is logged against them.
 */
export const searchStorage = (
  body: SearchBody,
  { store, signedIn, signal }: { store: SessionStore; signedIn: boolean; signal?: AbortSignal },
) => {
  const options = { method: 'POST', body, schema: searchResponseSchema, signal } as const;
  return signedIn ? store.authorizedRequest('/search', options) : apiRequest('/search', options);
};

/** Results are cached under the body searched, which the facility screen reads distances from. */
export const searchQueryKey = (body: SearchBody | undefined) => ['search', body] as const;
