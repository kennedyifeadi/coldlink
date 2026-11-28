import { queryOptions } from '@tanstack/react-query';
import * as z from 'zod';
import {
  deliveryQuoteSchema,
  farmerDeliverySchema,
  initializedPaymentSchema,
  type CreateDeliveryBody,
  type DeliveryQuoteBody,
  type DeliveryRefusal,
} from '@coldlink/shared';
import { isApiError } from './client';
import type { SessionStore } from '../session/sessionStore';

type AuthorizedRequest = SessionStore['authorizedRequest'];

// A quote for a booking needs its farmer's session (decision 146), so it goes with the token.
export const quoteDelivery = (
  request: AuthorizedRequest,
  body: DeliveryQuoteBody,
  signal?: AbortSignal,
) => request('/deliveries/quote', { method: 'POST', body, schema: deliveryQuoteSchema, signal });

export const createDelivery = (request: AuthorizedRequest, body: CreateDeliveryBody) =>
  request('/deliveries', { method: 'POST', body, schema: farmerDeliverySchema });

export const deliveryKey = (deliveryId: string) => ['delivery', deliveryId] as const;

// Never cached as fresh: a partner moves it along while the farmer watches.
export const deliveryQuery = (request: AuthorizedRequest, deliveryId: string) =>
  queryOptions({
    queryKey: deliveryKey(deliveryId),
    queryFn: ({ signal }) =>
      request(`/deliveries/${encodeURIComponent(deliveryId)}`, {
        schema: farmerDeliverySchema,
        signal,
      }),
  });

/** A delivery asked for after booking is paid on its own (decision 143). */
export const initializeDeliveryPayment = (request: AuthorizedRequest, deliveryId: string) =>
  request('/payments/initialize', {
    method: 'POST',
    body: { delivery_request_id: deliveryId },
    schema: initializedPaymentSchema,
  });

const refusalDetailsSchema = z.object({
  delivery_request_id: z.uuid().optional(),
  status: z.string().optional(),
});

/**
 * Which of decision 141's refusals a 409 from the delivery quote or `POST /deliveries` is: one
 * naming a live delivery, one naming the booking's status, or the window that has closed.
 */
export const deliveryRefusalOf = (error: unknown): DeliveryRefusal | undefined => {
  if (!isApiError(error, 'conflict')) return undefined;
  const details = refusalDetailsSchema.safeParse(error.details).data;
  if (details?.delivery_request_id !== undefined) return 'already_live';
  if (details?.status !== undefined) return 'not_accepted';
  return 'window_closed';
};
