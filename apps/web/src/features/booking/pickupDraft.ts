import { createContext, useContext } from 'react';
import type { DeliveryDetailsBody } from '@coldlink/shared';
import { bookingStepPath, type BookingRoute } from './bookingIntent';
import type { DeliveryFormValues } from './deliveryFields';

/**
 * A pickup asked for at review, waiting for the booking to be made (PRD 7.4 step 2). Held in memory
 * above the routes, like the search draft, so it survives the sign-in before payment; it is
 * personal data and stays out of the URL and browser storage, so a reload loses it.
 */
export interface PickupDraft {
  /** The booking it was filled in for: its facility and terms. */
  key: string;
  wanted: boolean;
  values: DeliveryFormValues;
  /** Set when the farmer goes on to pay with the form complete; any change clears it. */
  details?: DeliveryDetailsBody;
}

export interface PickupDraftFlow {
  draft: PickupDraft | undefined;
  save: (draft: PickupDraft) => void;
  clear: () => void;
}

export const PickupDraftContext = createContext<PickupDraftFlow | null>(null);

export const usePickupDraftFlow = () => {
  const flow = useContext(PickupDraftContext);
  if (!flow) throw new Error('usePickupDraftFlow needs a PickupDraftProvider');
  return flow;
};

export const pickupDraftKey = ({ providerId, intent }: BookingRoute) =>
  bookingStepPath('review', providerId, intent);

/** The draft for this booking, never another one's. */
export const usePickupDraft = (route: BookingRoute | undefined) => {
  const flow = usePickupDraftFlow();
  const draft =
    route !== undefined && flow.draft?.key === pickupDraftKey(route) ? flow.draft : undefined;
  return { ...flow, draft };
};

// Says only that a pickup was asked for, never its details, so payment knows to ask again when a
// reload has lost them.
const PICKUP_PARAM = 'pickup';

export const withPickupFlag = (path: string) => `${path}&${PICKUP_PARAM}=1`;

export const hasPickupFlag = (query: URLSearchParams) => query.get(PICKUP_PARAM) === '1';
