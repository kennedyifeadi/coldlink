import {
  capacityUnitSchema,
  providerBookingsQuerySchema,
  providerPayoutsQuerySchema,
  todayInLagos,
  type ProviderBookingsQueryInput,
  type ProviderBookingsResponse,
  type ProviderDashboard,
  type ProviderPayoutsQueryInput,
  type ProviderPayoutsResponse,
} from '@coldlink/shared';
import { Router, type Request, type RequestHandler } from 'express';
import * as z from 'zod';
import { occupancyOn } from '../bookings/availability.js';
import {
  countProviderBookings,
  findProviderBookingDetail,
  listDashboardBookings,
  listProviderBookings,
  providerEarnings,
} from '../bookings/providerStore.js';
import { BookingNotFoundError } from '../bookings/transition.js';
import { toProviderBooking, toProviderBookingDetail } from '../bookings/views.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import {
  requireAuth,
  requireRole,
  signedInUser,
  type AuthDependencies,
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listProviderPayouts } from '../payments/payoutStore.js';
import { toProviderPayout } from '../payments/payoutViews.js';
import { findProviderSummary } from '../providers/store.js';

export interface ProviderDashboardRouteDependencies extends AuthDependencies {
  now?: () => Date;
}

const providerParamsSchema = z.object({ id: z.uuid() });
const bookingParamsSchema = providerParamsSchema.extend({ bookingId: z.uuid() });
type ProviderParams = z.infer<typeof providerParamsSchema>;
type BookingParams = z.infer<typeof bookingParamsSchema>;

// Every answer, errors included, holds one facility's bookings or says whether it exists.
const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

/**
 * The facility in the URL if the caller owns it or is an admin. Anyone else gets the same 404 as
 * an unknown id, so ids cannot be probed (decisions 85, 97); editing still answers 403 (decision 64).
 */
async function readableProvider(db: Database, req: Request) {
  const { id } = req.params as ProviderParams;
  const user = signedInUser(req);
  const provider = await findProviderSummary(db, id);
  if (
    provider === undefined ||
    (provider.owner_user_id !== user.id && !user.roles.includes('admin'))
  ) {
    throw new AppError('not_found', 'Facility not found');
  }
  return provider;
}

export function providerDashboardRoutes(deps: ProviderDashboardRouteDependencies): Router {
  const { db, now = () => new Date() } = deps;
  const router = Router();
  const readers = [noStore, requireAuth(deps), requireRole('provider', 'admin')];

  router.get(
    '/providers/:id/dashboard',
    ...readers,
    validate({ params: providerParamsSchema }),
    async (req, res) => {
      const provider = await readableProvider(db, req);
      const today = todayInLagos(now());
      // One after another: in parallel, each view would take six of the pool's ten connections.
      const occupancy = await occupancyOn(db, provider.id, today);
      const counts = await countProviderBookings(db, provider.id);
      const list = async (group: 'requests' | 'upcoming' | 'in_storage') => ({
        count: counts[group],
        items: (await listDashboardBookings(db, provider.id, group)).map(toProviderBooking),
      });
      const body: ProviderDashboard = {
        provider: { id: provider.id, display_name: provider.display_name },
        occupancy: {
          date: today,
          ...occupancy,
          capacity_unit: capacityUnitSchema.parse(provider.capacity_unit),
        },
        requests: await list('requests'),
        upcoming: await list('upcoming'),
        in_storage: await list('in_storage'),
        earnings: await providerEarnings(db, provider.id),
      };
      res.json(body);
    },
  );

  router.get(
    '/providers/:id/bookings',
    ...readers,
    validate({ params: providerParamsSchema, query: providerBookingsQuerySchema }),
    async (req, res) => {
      const provider = await readableProvider(db, req);
      const page = await listProviderBookings(
        db,
        provider.id,
        req.query as unknown as ProviderBookingsQueryInput,
      );
      const body: ProviderBookingsResponse = {
        data: page.rows.map(toProviderBooking),
        next_cursor: page.nextCursor,
      };
      res.json(body);
    },
  );

  // A booking of another facility, or one this facility was never asked about, is the same 404.
  router.get(
    '/providers/:id/bookings/:bookingId',
    ...readers,
    validate({ params: bookingParamsSchema }),
    async (req, res) => {
      const provider = await readableProvider(db, req);
      const { bookingId } = req.params as BookingParams;
      const detail = await findProviderBookingDetail(db, provider.id, bookingId);
      if (detail === undefined) throw new BookingNotFoundError(bookingId);
      res.json(toProviderBookingDetail(detail));
    },
  );

  router.get(
    '/providers/:id/payouts',
    ...readers,
    validate({ params: providerParamsSchema, query: providerPayoutsQuerySchema }),
    async (req, res) => {
      const provider = await readableProvider(db, req);
      const page = await listProviderPayouts(
        db,
        provider.id,
        req.query as unknown as ProviderPayoutsQueryInput,
      );
      const body: ProviderPayoutsResponse = {
        data: page.rows.map(toProviderPayout),
        next_cursor: page.nextCursor,
        earnings: await providerEarnings(db, provider.id),
      };
      res.json(body);
    },
  );

  return router;
}
