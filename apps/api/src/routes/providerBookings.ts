import { rejectBookingBodySchema, todayInLagos, type RejectBookingInput } from '@coldlink/shared';
import { Router, type Request, type RequestHandler } from 'express';
import * as z from 'zod';
import type { TransitionHooks } from '../bookings/hooks.js';
import { performProviderAction, type ProviderAction } from '../bookings/providerActions.js';
import { requireProviderBooking } from '../bookings/providerStore.js';
import { runAfterCommitHooks } from '../bookings/transition.js';
import { toProviderBooking } from '../bookings/views.js';
import { inTransaction } from '../db/transaction.js';
import {
  requireAuth,
  requireRole,
  signedInUser,
  type AuthDependencies,
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export interface ProviderBookingRouteDependencies extends AuthDependencies {
  hooks: TransitionHooks;
  now?: () => Date;
}

const bookingParamsSchema = z.object({ id: z.uuid() });
type BookingParams = z.infer<typeof bookingParamsSchema>;

export function providerBookingRoutes(deps: ProviderBookingRouteDependencies): Router {
  const { db, hooks, now = () => new Date() } = deps;
  const router = Router();

  function act(action: ProviderAction, reason: (req: Request) => string | undefined) {
    const handler: RequestHandler = async (req, res) => {
      const { id } = req.params as BookingParams;
      const user = signedInUser(req);
      const given = reason(req);
      const { result, booking } = await inTransaction(db, async (trx) => {
        const transition = await performProviderAction(trx, hooks, {
          bookingId: id,
          action,
          caller: { userId: user.id, isAdmin: user.roles.includes('admin') },
          today: todayInLagos(now()),
          ...(given === undefined ? {} : { reason: given }),
        });
        return { result: transition, booking: await requireProviderBooking(trx, id) };
      });
      await runAfterCommitHooks(req.log, result);
      res.set('Cache-Control', 'no-store').json(toProviderBooking(booking));
    };
    return handler;
  }

  const noReason = () => undefined;
  const answerers = [requireAuth(deps), requireRole('provider', 'admin')];
  // Admins cannot check in or collect (decision 52), so they are refused before any lookup.
  const providersOnly = [requireAuth(deps), requireRole('provider')];
  const params = validate({ params: bookingParamsSchema });

  router.post('/bookings/:id/accept', ...answerers, params, act('accept', noReason));
  router.post(
    '/bookings/:id/reject',
    ...answerers,
    // The body may be left out: a reason is optional.
    validate({ params: bookingParamsSchema, body: rejectBookingBodySchema.optional() }),
    act('reject', (req) => (req.body as RejectBookingInput | undefined)?.reason),
  );
  router.post('/bookings/:id/check-in', ...providersOnly, params, act('check_in', noReason));
  router.post('/bookings/:id/collect', ...providersOnly, params, act('collect', noReason));

  return router;
}
