import { assignDeliveryBodySchema, type AssignDeliveryBody } from '@coldlink/shared';
import { Router, type RequestHandler } from 'express';
import * as z from 'zod';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import type { DeliveryLinks } from '../deliveries/partnerLinks.js';
import { assignDelivery, finishMove } from '../deliveries/partnerMoves.js';
import { readAdminDelivery } from '../deliveries/partnerStore.js';
import { toAdminDelivery } from '../deliveries/partnerViews.js';
import { requireAuth, requireRole, type AuthDependencies } from '../middleware/auth.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import type { SmsTemplateRegistry } from '../notifications/registry.js';
import type { NotificationDeps } from '../notifications/send.js';

/** Admin work is a few people's; this only stops a client hammering the database. */
export const defaultAdminIpLimit: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 300 };

export interface AdminDeliveryRouteDependencies extends AuthDependencies {
  db: Database;
  notifications: NotificationDeps<SmsTemplateRegistry>;
  deliveryLinks: DeliveryLinks;
  ipLimit: RateLimitOptions;
}

const deliveryParamsSchema = z.object({ id: z.uuid() });
type DeliveryParams = z.infer<typeof deliveryParamsSchema>;

/** The admin's delivery routes; #46 adds the queue and the rest of the admin API. */
export function adminDeliveryRoutes(deps: AdminDeliveryRouteDependencies): Router {
  const { db, notifications, deliveryLinks } = deps;
  const router = Router();
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };

  // Assigns a live `requested` delivery, or reassigns one the partner has not accepted yet
  // (decisions 147, 153). delivery_job goes to the partner after the commit.
  router.post(
    '/admin/deliveries/:id/assign',
    rateLimit(deps.ipLimit),
    noStore,
    requireAuth(deps),
    requireRole('admin'),
    validate({ params: deliveryParamsSchema, body: assignDeliveryBodySchema }),
    async (req, res) => {
      const { id } = req.params as DeliveryParams;
      const { partner_id: partnerId } = req.body as AssignDeliveryBody;
      const effects = await inTransaction(db, (trx) =>
        assignDelivery(
          trx,
          { links: deliveryLinks, templates: notifications.templates },
          { deliveryId: id, partnerId },
        ),
      );
      await finishMove(notifications, req.log, effects);
      res.json(toAdminDelivery(await readAdminDelivery(db, id)));
    },
  );

  return router;
}
