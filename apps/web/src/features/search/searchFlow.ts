import { createContext, useContext } from 'react';
import * as z from 'zod';
import type { CapacityUnit, Crop, SearchBody } from '@coldlink/shared';
import type { AreaId } from './areas';

export type SearchPlace =
  | { kind: 'device'; lat: number; lng: number }
  | { kind: 'area'; areaId: AreaId; lat: number; lng: number }
  | { kind: 'pin'; lat: number; lng: number };

export interface SearchAmount {
  quantity: number;
  capacity_unit: CapacityUnit;
  days: number;
  start_date: string;
}

/**
 * The search being built across the location, produce and amount steps. Held in memory only, like
 * a pending sign-in: a farmer's location is personal data and stays out of the URL and storage.
 */
export interface SearchDraft {
  place?: SearchPlace;
  crop?: Crop;
  amount?: SearchAmount;
}

export interface SearchFlow {
  draft: SearchDraft;
  update: (changes: Partial<SearchDraft>) => void;
}

export const SearchFlowContext = createContext<SearchFlow | null>(null);

export const useSearchFlow = () => {
  const flow = useContext(SearchFlowContext);
  if (!flow) throw new Error('useSearchFlow needs a SearchFlowProvider');
  return flow;
};

export const SEARCH_STEPS = {
  place: '/location',
  crop: '/produce',
  amount: '/amount',
  results: '/results',
} as const;

type ReadDraft =
  { missing: keyof typeof SEARCH_STEPS } | { body: SearchBody; crop: Crop; place: SearchPlace };

/** The first step still to fill in, or the request body once every step is done. */
export const readDraft = (draft: SearchDraft): ReadDraft => {
  const { place, crop, amount } = draft;
  if (!place) return { missing: 'place' };
  if (!crop) return { missing: 'crop' };
  if (!amount) return { missing: 'amount' };
  return {
    body: { lat: place.lat, lng: place.lng, crop_id: crop.id, ...amount },
    crop,
    place,
  };
};

/** Router state that tells the first search step why the farmer was sent back to it. */
export const searchNoticeStateSchema = z.object({ notice: z.literal('bookingLinkBroken') });
export type SearchNoticeState = z.infer<typeof searchNoticeStateSchema>;
