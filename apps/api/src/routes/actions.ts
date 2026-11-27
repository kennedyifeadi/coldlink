import {
  providerLinkActionBodySchema,
  todayInLagos,
  type ProviderLinkActionBody,
  type ProviderLinkActionResult,
} from '@coldlink/shared';
import { Router } from 'express';
import * as z from 'zod';
import { linkNotFound } from '../actions/linkNotFound.js';
import { findProviderToken, lockProviderToken, markTokenUsed } from '../actions/tokens.js';
import type { TransitionHooks } from '../bookings/hooks.js';
import { performProviderAction } from '../bookings/providerActions.js';
import { facilityOwnerId, requireProviderBooking } from '../bookings/providerStore.js';
import { runAfterCommitHooks } from '../bookings/transition.js';
import { toProviderBookingRequest } from '../bookings/views.js';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

// A provider opens a link a few times at most. Guessing a 256-bit token is hopeless anyway; this
// only stops a client hammering the database.
export const defaultActionIpLimit: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 60 };

export interface ActionRouteDependencies {
  db: Database;
  hooks: TransitionHooks;
  ipLimit: RateLimitOptions;
  now?: () => Date;
}

const statusOf = { accept: 'confirmed', reject: 'rejected' } as const;

// Any text: a malformed token is just another unknown one, with the same 404.
const tokenParamsSchema = z.object({ token: z.string() });
type TokenParams = z.infer<typeof tokenParamsSchema>;

export function actionRoutes({
  db,
  hooks,
  ipLimit,
  now = () => new Date(),
}: ActionRouteDependencies): Router {
  const router = Router();
  const limit = rateLimit(ipLimit);

  router.get(
    '/actions/:token',
    limit,
    validate({ params: tokenParamsSchema }),
    async (req, res) => {
      const found = await findProviderToken(db, (req.params as TokenParams).token);
      if (found === undefined) throw linkNotFound();
      const booking = await requireProviderBooking(db, found.bookingId);
      res.set('Cache-Control', 'no-store').json(toProviderBookingRequest(booking));
    },
  );

  // The token is locked before the booking, and nothing locks them the other way round, so a link
  // and the dashboard answering at once run one after the other.
  router.post(
    '/actions/:token',
    limit,
    validate({ params: tokenParamsSchema, body: providerLinkActionBodySchema }),
    async (req, res) => {
      const { token: raw } = req.params as TokenParams;
      const { action } = req.body as ProviderLinkActionBody;
      const result = await inTransaction(db, async (trx) => {
        const token = await lockProviderToken(trx, raw);
        if (token === undefined) throw linkNotFound();
        const ownerId = await facilityOwnerId(trx, token.bookingId);
        const transition = await performProviderAction(trx, hooks, {
          bookingId: token.bookingId,
          action,
          caller: { userId: ownerId, isAdmin: false },
          today: todayInLagos(now()),
        });
        await markTokenUsed(trx, token.id);
        return transition;
      });
      await runAfterCommitHooks(req.log, result);
      const body: ProviderLinkActionResult = { status: statusOf[action] };
      res.set('Cache-Control', 'no-store').json(body);
    },
  );

  return router;
}
