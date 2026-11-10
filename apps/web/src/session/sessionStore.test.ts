import { describe, expect, it, vi } from 'vitest';
import { userProfileSchema } from '@coldlink/shared';
import { ApiError } from '../api/client';
import {
  errorResponse,
  jsonResponse,
  mockApi,
  noContent,
  requestsTo,
  sessionFixture,
} from '../test/api';
import { createSessionStore, type SessionStore } from './sessionStore';

const settle = (store: SessionStore) =>
  vi.waitFor(() => expect(store.getSnapshot().status).not.toBe('loading'));

const hold = () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
};

const profile = sessionFixture().user;
const getMe = (store: SessionStore) =>
  store.authorizedRequest('/me', { schema: userProfileSchema });
const authorizationOf = (call: Parameters<typeof fetch> | undefined) =>
  new Headers(call?.[1]?.headers).get('Authorization');

describe('session store', () => {
  it('restores a session from the refresh cookie when the app loads', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': jsonResponse(200, sessionFixture()) });
    const store = createSessionStore();

    store.restore();
    await settle(store);

    expect(store.getSnapshot()).toEqual({ status: 'signedIn', user: profile });
    const [refresh] = requestsTo(fetchMock, 'POST', '/auth/refresh');
    expect(refresh?.[1]?.credentials).toBe('include');
  });

  it('is signed out when there is no session to restore', async () => {
    mockApi({ 'POST /auth/refresh': errorResponse(401, 'unauthorized') });
    const store = createSessionStore();

    store.restore();
    await settle(store);

    expect(store.getSnapshot()).toEqual({ status: 'signedOut' });
  });

  it('is signed out when the account was turned off', async () => {
    mockApi({ 'POST /auth/refresh': errorResponse(403, 'account_disabled') });
    const store = createSessionStore();

    store.restore();
    await settle(store);

    expect(store.getSnapshot()).toEqual({ status: 'signedOut' });
  });

  it('reports the API unreachable on load, and restores on retry', async () => {
    mockApi({
      'POST /auth/refresh': [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(200, sessionFixture()),
      ],
    });
    const store = createSessionStore();

    store.restore();
    await settle(store);
    expect(store.getSnapshot()).toEqual({
      status: 'unavailable',
      error: expect.objectContaining({ code: 'network' }) as unknown,
    });

    store.retryRestore();
    await settle(store);
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('sends one refresh when restore is called twice at once, as React StrictMode does', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': jsonResponse(200, sessionFixture()) });
    const store = createSessionStore();

    store.restore();
    store.restore();
    await settle(store);

    expect(requestsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);
  });

  it('sends the access token with authorized requests', async () => {
    const fetchMock = mockApi({ 'GET /me': jsonResponse(200, profile) });
    const store = createSessionStore();
    store.start(sessionFixture({ accessToken: 'token-a' }));

    await expect(getMe(store)).resolves.toEqual(profile);
    expect(authorizationOf(requestsTo(fetchMock, 'GET', '/me')[0])).toBe('Bearer token-a');
  });

  it('makes exactly one refresh call when two requests get a 401 at the same time', async () => {
    const refresh = hold();
    const fetchMock = mockApi({
      'GET /me': ({ headers }) =>
        headers.get('Authorization') === 'Bearer fresh-token'
          ? jsonResponse(200, profile)
          : errorResponse(401, 'unauthorized'),
      'POST /auth/refresh': async () => {
        await refresh.held;
        return jsonResponse(200, sessionFixture({ accessToken: 'fresh-token' }));
      },
    });
    const store = createSessionStore();
    store.start(sessionFixture({ accessToken: 'stale-token' }));

    const both = Promise.all([getMe(store), getMe(store)]);
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1));
    refresh.release();

    await expect(both).resolves.toEqual([profile, profile]);
    expect(requestsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);
    expect(requestsTo(fetchMock, 'GET', '/me').map(authorizationOf)).toEqual([
      'Bearer stale-token',
      'Bearer stale-token',
      'Bearer fresh-token',
      'Bearer fresh-token',
    ]);
  });

  it('retries with a token refreshed while its request was out, without refreshing again', async () => {
    const staleReply = hold();
    const fetchMock = mockApi({
      'GET /me': async ({ headers }) => {
        if (headers.get('Authorization') === 'Bearer fresh-token') {
          return jsonResponse(200, profile);
        }
        await staleReply.held;
        return errorResponse(401, 'unauthorized');
      },
    });
    const store = createSessionStore();
    store.start(sessionFixture({ accessToken: 'stale-token' }));

    const request = getMe(store);
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'GET', '/me')).toHaveLength(1));
    store.start(sessionFixture({ accessToken: 'fresh-token' }));
    staleReply.release();

    await expect(request).resolves.toEqual(profile);
    expect(requestsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(0);
  });

  it('refreshes before a request when the token is about to expire', async () => {
    let now = 1_000_000;
    const fetchMock = mockApi({
      'GET /me': jsonResponse(200, profile),
      'POST /auth/refresh': jsonResponse(200, sessionFixture({ accessToken: 'fresh-token' })),
    });
    const store = createSessionStore(() => now);
    store.start(sessionFixture({ accessToken: 'old-token' }));
    now += 890_000;

    await getMe(store);

    expect(requestsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);
    expect(authorizationOf(requestsTo(fetchMock, 'GET', '/me')[0])).toBe('Bearer fresh-token');
  });

  it('signs out when the refresh token is refused', async () => {
    mockApi({
      'GET /me': errorResponse(401, 'unauthorized'),
      'POST /auth/refresh': errorResponse(401, 'unauthorized'),
    });
    const store = createSessionStore();
    store.start(sessionFixture());

    await expect(getMe(store)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(store.getSnapshot()).toEqual({ status: 'signedOut' });
  });

  it('signs out when even a fresh token is refused', async () => {
    const fetchMock = mockApi({
      'GET /me': errorResponse(401, 'unauthorized'),
      'POST /auth/refresh': jsonResponse(200, sessionFixture({ accessToken: 'fresh-token' })),
    });
    const store = createSessionStore();
    store.start(sessionFixture());

    await expect(getMe(store)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(store.getSnapshot()).toEqual({ status: 'signedOut' });
    expect(requestsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1);
  });

  it('keeps the session when a refresh fails for a network error', async () => {
    mockApi({
      'GET /me': errorResponse(401, 'unauthorized'),
      'POST /auth/refresh': () => Promise.reject(new TypeError('Failed to fetch')),
    });
    const store = createSessionStore();
    store.start(sessionFixture());

    await expect(getMe(store)).rejects.toMatchObject({ code: 'network' });
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('refuses an authorized request without calling the API when signed out', async () => {
    const fetchMock = mockApi({});
    const store = createSessionStore();

    await expect(getMe(store)).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls logout and forgets the session', async () => {
    const fetchMock = mockApi({ 'POST /auth/logout': noContent() });
    const store = createSessionStore();
    store.start(sessionFixture());

    await store.signOut();

    expect(requestsTo(fetchMock, 'POST', '/auth/logout')).toHaveLength(1);
    expect(store.getSnapshot()).toEqual({ status: 'signedOut' });
    await expect(getMe(store)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('stays signed in when logout does not reach the API', async () => {
    mockApi({ 'POST /auth/logout': () => Promise.reject(new TypeError('Failed to fetch')) });
    const store = createSessionStore();
    store.start(sessionFixture());

    await expect(store.signOut()).rejects.toMatchObject({ code: 'network' });
    expect(store.getSnapshot().status).toBe('signedIn');
  });

  it('never writes the access token to browser storage', async () => {
    mockApi({ 'POST /auth/refresh': jsonResponse(200, sessionFixture({ accessToken: 'secret' })) });
    const store = createSessionStore();

    store.restore();
    await settle(store);

    expect(JSON.stringify({ ...localStorage })).not.toContain('secret');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret');
  });
});
