import type { SessionResponse, UserProfile } from '@coldlink/shared';
import { logout, refreshSession } from '../api/auth';
import { apiRequest, ApiError, isApiError, type ApiRequestOptions } from '../api/client';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: UserProfile }
  /** The first refresh on load failed for a reason other than having no session. */
  | { status: 'unavailable'; error: unknown };

export interface SessionStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SessionState;
  /** Restores the session from the refresh cookie, once, when the app loads. */
  restore: () => void;
  retryRestore: () => void;
  start: (session: SessionResponse) => void;
  signOut: () => Promise<void>;
  /** Sends a request with the access token, refreshing it first if it is about to expire or on a 401. */
  authorizedRequest: <T>(
    path: string,
    options: Omit<ApiRequestOptions<T>, 'accessToken'>,
  ) => Promise<T>;
}

// Refresh this long before expiry, so a request never leaves with a token that dies on the way.
const EXPIRY_MARGIN_MS = 30_000;
const REFRESH_LOCK = 'coldlink-refresh';

// Each refresh replaces the token, and the API treats a replaced token as stolen and revokes the
// whole session (decision 59). Within a tab, callers share one promise; across tabs, a Web Lock
// queues them, so the second tab sends the cookie the first one received.
const withRefreshLock = <T>(task: () => Promise<T>): Promise<T> =>
  'locks' in navigator ? navigator.locks.request(REFRESH_LOCK, task) : task();

const endsSession = (error: unknown) =>
  isApiError(error, 'unauthorized') || isApiError(error, 'account_disabled');

export const createSessionStore = (now: () => number = Date.now): SessionStore => {
  let state: SessionState = { status: 'loading' };
  let accessToken: string | undefined;
  let expiresAt = 0;
  let refreshing: Promise<string | undefined> | undefined;
  let restoring = false;
  const listeners = new Set<() => void>();

  const setState = (next: SessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const start = (session: SessionResponse) => {
    accessToken = session.access_token;
    expiresAt = now() + session.expires_in * 1000;
    setState({ status: 'signedIn', user: session.user });
  };

  const end = () => {
    accessToken = undefined;
    expiresAt = 0;
    setState({ status: 'signedOut' });
  };

  const refresh = () => {
    refreshing ??= withRefreshLock(refreshSession)
      .then(
        (session) => {
          start(session);
          return session.access_token;
        },
        (error: unknown) => {
          if (!endsSession(error)) throw error;
          end();
          return undefined;
        },
      )
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  };

  const currentToken = async () => {
    if (refreshing) return refreshing;
    if (accessToken === undefined) return undefined;
    if (expiresAt - now() > EXPIRY_MARGIN_MS) return accessToken;
    return refresh();
  };

  const restore = () => {
    if (state.status !== 'loading' || restoring) return;
    restoring = true;
    refresh()
      .catch((error: unknown) => setState({ status: 'unavailable', error }))
      .finally(() => {
        restoring = false;
      });
  };

  const authorizedRequest: SessionStore['authorizedRequest'] = async (path, options) => {
    const token = await currentToken();
    if (token === undefined) throw new ApiError('unauthorized', 'Not signed in', { status: 401 });
    try {
      return await apiRequest(path, { ...options, accessToken: token });
    } catch (error) {
      if (!isApiError(error, 'unauthorized')) throw error;
      // Another caller may already have refreshed while this request was out.
      const retryToken =
        accessToken !== undefined && accessToken !== token ? accessToken : await refresh();
      if (retryToken === undefined) throw error;
      try {
        return await apiRequest(path, { ...options, accessToken: retryToken });
      } catch (retryError) {
        // A fresh token refused too: the user is gone or deactivated.
        if (isApiError(retryError, 'unauthorized')) end();
        throw retryError;
      }
    }
  };

  const signOut = async () => {
    await logout();
    end();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    restore,
    retryRestore: () => {
      if (state.status !== 'unavailable') return;
      setState({ status: 'loading' });
      restore();
    },
    start,
    signOut,
    authorizedRequest,
  };
};
