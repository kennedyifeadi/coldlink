import {
  providerBookingRequestSchema,
  providerLinkActionResultSchema,
  type ProviderLinkActionBody,
} from '@coldlink/shared';
import { apiRequest } from './client';

// The token is a password in the URL (decision 101): it goes to these two calls and nowhere else.
const actionPath = (token: string) => `/actions/${encodeURIComponent(token)}`;

export const fetchActionLink = (token: string, signal?: AbortSignal) =>
  apiRequest(actionPath(token), { schema: providerBookingRequestSchema, signal });

export const answerActionLink = (token: string, body: ProviderLinkActionBody) =>
  apiRequest(actionPath(token), {
    method: 'POST',
    body,
    schema: providerLinkActionResultSchema,
  });
