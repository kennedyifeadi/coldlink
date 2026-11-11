import {
  searchBodySchema,
  type AppConfig,
  type SearchInput,
  type SearchResponse,
  type SearchResult,
} from '@coldlink/shared';
import { Router } from 'express';
import type { AppConfigReader } from '../appConfig.js';
import { pricingFor } from '../bookings/pricing.js';
import { invalidBody } from '../errors.js';
import { optionalAuth, type AuthDependencies } from '../middleware/auth.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { toPublicProvider } from '../providers/views.js';
import { visibleStatuses } from '../providers/visibility.js';
import { displayDistanceKm, rankResults } from '../search/ranking.js';
import {
  findCropCategoryId,
  logSearch,
  searchProviders,
  type SearchCandidate,
  type SearchCriteria,
} from '../search/store.js';
import type { PhotoStorage } from '../storage/photoStorage.js';
import { storagePeriod } from '../storagePeriod.js';

// Per IP and per instance, as for the auth limits (decision 56). Loose because carrier-grade NAT
// puts many farmers behind one mobile IP, and a farmer adjusting the form searches several times.
export const defaultSearchIpLimit: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 300 };

export interface SearchRouteDependencies extends AuthDependencies {
  appConfig: AppConfigReader;
  storage: PhotoStorage;
  ipLimit: RateLimitOptions;
  now?: () => Date;
}

function toResult(
  candidate: SearchCandidate,
  input: SearchInput,
  config: AppConfig,
  storage: PhotoStorage,
): SearchResult {
  const pricing = pricingFor(candidate.provider, input, config);
  return {
    provider: toPublicProvider(candidate.provider, storage),
    distance_km: displayDistanceKm(candidate.distance_km),
    available_quantity: candidate.available_quantity,
    storage_subtotal_kobo: pricing.storage_subtotal_kobo,
    service_fee_kobo: pricing.service_fee_kobo,
    // With no delivery, what is paid online plus what is paid at the facility.
    total_estimate_kobo: pricing.total_charged_online_kobo + pricing.balance_due_kobo,
    deposit_kobo: pricing.deposit_kobo,
  };
}

function ranked(candidates: SearchCandidate[]): SearchCandidate[] {
  return rankResults(
    candidates.map((candidate) => ({
      ...candidate,
      id: candidate.provider.id,
      avg_rating: candidate.provider.avg_rating,
    })),
  );
}

export function searchRoutes(deps: SearchRouteDependencies): Router {
  const { db, appConfig, storage, ipLimit, now = () => new Date() } = deps;
  const router = Router();

  router.post(
    '/search',
    rateLimit(ipLimit),
    optionalAuth(deps),
    validate({ body: searchBodySchema }),
    async (req, res) => {
      const input = req.body as SearchInput;
      const { startDate, endDate } = storagePeriod(input.start_date, input.days, now());
      const categoryId = await findCropCategoryId(db, input.crop_id);
      if (categoryId === undefined) throw invalidBody('crop_id', 'Unknown crop');

      const config = await appConfig.get();
      const criteria: SearchCriteria = {
        lat: input.lat,
        lng: input.lng,
        radiusKm: config.search_default_radius_km,
        categoryId,
        quantity: input.quantity,
        capacityUnit: input.capacity_unit,
        startDate,
        endDate,
        verificationStatuses: visibleStatuses(config),
      };

      let candidates = await searchProviders(db, criteria);
      // PRD 6.8: one retry at the maximum radius when nothing is near.
      const expanded =
        candidates.length === 0 && config.search_max_radius_km > config.search_default_radius_km;
      if (expanded) {
        candidates = await searchProviders(db, {
          ...criteria,
          radiusKm: config.search_max_radius_km,
        });
      }

      await logSearch(db, {
        userId: req.user?.id,
        lat: input.lat,
        lng: input.lng,
        cropId: input.crop_id,
        quantity: input.quantity,
        days: input.days,
        resultCount: candidates.length,
        expandedRadius: expanded,
      });

      const body: SearchResponse = {
        data: ranked(candidates).map((candidate) => toResult(candidate, input, config, storage)),
        expanded_radius: expanded,
        radius_km: expanded ? config.search_max_radius_km : config.search_default_radius_km,
        start_date: startDate,
        end_date: endDate,
      };
      res.json(body);
    },
  );

  return router;
}
