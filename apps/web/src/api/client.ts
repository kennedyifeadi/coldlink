import * as z from 'zod';
import { errorResponseSchema, type ErrorCode } from '@coldlink/shared';
import { env } from '../env';

/** The API's own error codes, plus the two failures that never reach it or come back unreadable. */
export type ApiErrorCode = ErrorCode | 'network' | 'unexpected_response';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly details: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    { status, retryAfterSeconds, details }: Partial<ApiErrorFields> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
  }
}

interface ApiErrorFields {
  status: number;
  retryAfterSeconds: number;
  details: unknown;
}

export const isApiError = (error: unknown, code?: ApiErrorCode): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);

export interface ApiRequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Sent as JSON, except a Blob, which is sent as it is with its own type (a photo upload). */
  body?: unknown;
  /** Parses the response body; a 204 is parsed as `undefined`. */
  schema: z.ZodType<T>;
  accessToken?: string;
  signal?: AbortSignal;
}

const retryAfterDetailsSchema = z.object({ retry_after_seconds: z.int().nonnegative() });

const readRetryAfter = (response: Response, details: unknown) => {
  const fromDetails = retryAfterDetailsSchema.safeParse(details);
  if (fromDetails.success) return fromDetails.data.retry_after_seconds;
  const header = response.headers.get('Retry-After');
  const seconds = header === null ? NaN : Number(header);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
};

const readJson = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return undefined;
  try {
    return await response.json();
  } catch {
    throw new ApiError('unexpected_response', `Unreadable response body (${response.status})`, {
      status: response.status,
    });
  }
};

const toApiError = (response: Response, body: unknown) => {
  const parsed = errorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return new ApiError('unexpected_response', `Unexpected error response (${response.status})`, {
      status: response.status,
    });
  }
  const { code, message, details } = parsed.data.error;
  return new ApiError(code, message, {
    status: response.status,
    details,
    retryAfterSeconds: readRetryAfter(response, details),
  });
};

const send = async (url: string, init: RequestInit) => {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('network', 'The request did not reach the API');
  }
};

export const apiRequest = async <T>(
  path: string,
  { method = 'GET', body, schema, accessToken, signal }: ApiRequestOptions<T>,
): Promise<T> => {
  const headers = new Headers({ Accept: 'application/json' });
  const isRaw = body instanceof Blob;
  if (isRaw) headers.set('Content-Type', body.type);
  else if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken !== undefined) headers.set('Authorization', `Bearer ${accessToken}`);

  // The refresh cookie rides on every call; its Path keeps it to the auth routes.
  const response = await send(`${env.VITE_API_URL}${path}`, {
    method,
    headers,
    body: isRaw ? body : body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
    signal,
  });
  const json = await readJson(response);
  if (!response.ok) throw toApiError(response, json);

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('unexpected_response', `Response from ${path} did not match its schema`, {
      status: response.status,
    });
  }
  return parsed.data;
};
