import { vi } from 'vitest';
import type { ErrorCode, SessionResponse, UserRole } from '@coldlink/shared';

export interface MockRequest {
  body: unknown;
  headers: Headers;
}

type Reply = Response | ((request: MockRequest) => Response | Promise<Response>);

export const jsonResponse = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const errorResponse = (
  status: number,
  code: ErrorCode,
  { details, headers }: { details?: unknown; headers?: HeadersInit } = {},
) =>
  jsonResponse(status, { error: { code, message: `API message for ${code}`, details } }, headers);

export const noContent = () => new Response(null, { status: 204 });

export const sessionFixture = ({
  isNewUser = false,
  coldlinkId = '4820193',
  roles = ['farmer'],
  accessToken = 'access-token-1',
}: {
  isNewUser?: boolean;
  coldlinkId?: string;
  roles?: UserRole[];
  accessToken?: string;
} = {}): SessionResponse => ({
  access_token: accessToken,
  token_type: 'Bearer',
  expires_in: 900,
  is_new_user: isNewUser,
  user: {
    id: '0b0c7c39-5a39-4a43-9f0e-7d1b8d3f8a11',
    coldlink_id: coldlinkId,
    phone_masked: '+234803***4567',
    full_name: null,
    roles,
    preferred_channel: 'web',
    home_lga: null,
    home_lat: null,
    home_lng: null,
    consented_at: '2026-11-10T09:00:00.000Z',
    created_at: '2026-11-10T09:00:00.000Z',
  },
});

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const jsonBody = (body: BodyInit | null | undefined): unknown =>
  typeof body === 'string' ? JSON.parse(body) : undefined;

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const replyBodies = new WeakMap<Response, Promise<string>>();

// Node's fetch can mark a cloned Response's original body as used once garbage collection runs,
// so cloning a Response shared between tests (a module-level route) fails at random. Each reply is
// read once instead, and every call gets a new Response built from it.
const copyOf = async (response: Response) => {
  let body = replyBodies.get(response);
  if (!body) {
    body = response.text();
    replyBodies.set(response, body);
  }
  const text = await body;
  return new Response(NULL_BODY_STATUSES.has(response.status) ? null : text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

/**
 * Replaces fetch with routes keyed by "METHOD /path" (relative to /api/v1). A route given an
 * array answers each call with the next reply and repeats the last. Unrouted calls fail the test.
 */
export const mockApi = (routes: Record<string, Reply | Reply[]>) => {
  const callCounts = new Map<string, number>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(urlOf(input), 'http://localhost').pathname.replace(/^\/api\/v1/, '');
    const key = `${init.method ?? 'GET'} ${path}`;
    const route = routes[key];
    if (route === undefined) throw new Error(`Unexpected request: ${key}`);
    const count = callCounts.get(key) ?? 0;
    callCounts.set(key, count + 1);
    const reply = Array.isArray(route) ? route[Math.min(count, route.length - 1)] : route;
    const request = {
      body: jsonBody(init.body),
      headers: new Headers(init.headers),
    };
    const response = typeof reply === 'function' ? await reply(request) : reply;
    return copyOf(response!);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

export const requestsTo = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      (init?.method ?? 'GET') === method && urlOf(input).endsWith(`/api/v1${path}`),
  );

export const bodyOf = (call: Parameters<typeof fetch>) => jsonBody(call[1]?.body);
