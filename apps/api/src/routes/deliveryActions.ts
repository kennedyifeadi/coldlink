import {
  partnerDeliveryActionBodySchema,
  type PartnerDeliveryActionBody,
  type PartnerDeliveryLink,
} from '@coldlink/shared';
import { Router } from 'express';
import * as z from 'zod';
import { linkNotFound } from '../actions/linkNotFound.js';
import { findDeliveryToken } from '../actions/tokens.js';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import type { DeliveryLinks } from '../deliveries/partnerLinks.js';
import { finishMove, performPartnerLinkAction } from '../deliveries/partnerMoves.js';
import { readPartnerJob } from '../deliveries/partnerStore.js';
import { toPartnerJob } from '../deliveries/partnerViews.js';
import { AppError } from '../errors.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import type { SmsTemplateRegistry } from '../notifications/registry.js';
import type { NotificationDeps } from '../notifications/send.js';

// As the provider's link (decision 101): a partner opens a link a few times at most, and guessing
// a 256-bit token is hopeless. Wrong handover codes have their own count per delivery.
export const defaultDeliveryActionIpLimit: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  limit: 60,
};

export interface DeliveryActionRouteDependencies {
  db: Database;
  notifications: NotificationDeps<SmsTemplateRegistry>;
  deliveryLinks: DeliveryLinks;
  ipLimit: RateLimitOptions;
}

// Any text: a malformed token is just another unknown one, with the same 404.
const tokenParamsSchema = z.object({ token: z.string() });
type TokenParams = z.infer<typeof tokenParamsSchema>;

/** The partner's SMS links (PRD 7.7 step 5; decisions 149, 154), opened without signing in. */
export function deliveryActionRoutes(deps: DeliveryActionRouteDependencies): Router {
  const { db, notifications, deliveryLinks } = deps;
  const router = Router();
  const limit = rateLimit(deps.ipLimit);

  router.get(
    '/delivery-actions/:token',
    limit,
    validate({ params: tokenParamsSchema }),
    async (req, res) => {
      const found = await findDeliveryToken(db, (req.params as TokenParams).token);
      if (found === undefined) throw linkNotFound();
      const body: PartnerDeliveryLink = {
        link: found.purpose === 'delivery_accept' ? 'accept' : 'update',
        job: toPartnerJob(await readPartnerJob(db, found.deliveryId)),
      };
      res.set('Cache-Control', 'no-store').json(body);
    },
  );

  router.post(
    '/delivery-actions/:token',
    limit,
    validate({ params: tokenParamsSchema, body: partnerDeliveryActionBodySchema }),
    async (req, res) => {
      const { token } = req.params as TokenParams;
      const outcome = await inTransaction(db, (trx) =>
        performPartnerLinkAction(
          trx,
          { links: deliveryLinks, templates: notifications.templates },
          token,
          req.body as PartnerDeliveryActionBody,
        ),
      );
      await finishMove(notifications, req.log, outcome.effects);
      res.set('Cache-Control', 'no-store');
      // The wrong code was counted in the committed transaction; only now is it refused.
      if (outcome.kind === 'wrong_code') {
        throw new AppError('handover_code_invalid', 'That handover code is not right', {
          handover_attempts_left: outcome.attemptsLeft,
        });
      }
      res.json(outcome.result);
    },
  );

  return router;
}
