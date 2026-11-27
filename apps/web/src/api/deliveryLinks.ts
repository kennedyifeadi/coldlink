import {
  handoverCodeInvalidDetailsSchema,
  partnerDeliveryActionResultSchema,
  partnerDeliveryLinkSchema,
  type PartnerDeliveryActionBody,
} from '@coldlink/shared';
import { apiRequest, isApiError } from './client';

// The token is a password in the URL (decision 149): it goes to these two calls and nowhere else.
const deliveryActionPath = (token: string) => `/delivery-actions/${encodeURIComponent(token)}`;

export const fetchDeliveryLink = (token: string, signal?: AbortSignal) =>
  apiRequest(deliveryActionPath(token), { schema: partnerDeliveryLinkSchema, signal });

export const actOnDeliveryLink = (token: string, body: PartnerDeliveryActionBody) =>
  apiRequest(deliveryActionPath(token), {
    method: 'POST',
    body,
    schema: partnerDeliveryActionResultSchema,
  });

/** Tries left after a wrong handover code, or undefined for any other error. */
export const handoverAttemptsLeftAfter = (error: unknown): number | undefined => {
  if (!isApiError(error, 'handover_code_invalid')) return undefined;
  const details = handoverCodeInvalidDetailsSchema.safeParse(error.details);
  return details.success ? details.data.handover_attempts_left : 0;
};
