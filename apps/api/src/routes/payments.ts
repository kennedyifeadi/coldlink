import {
  bookingStatusSchema,
  initializePaymentBodySchema,
  paymentReferenceSchema,
  paymentStatusSchema,
  type InitializedPayment,
  type PaymentVerification,
} from '@coldlink/shared';
import { Router } from 'express';
import type { Logger } from 'pino';
import * as z from 'zod';
import type { BackgroundTasks } from '../backgroundTasks.js';
import { AppError } from '../errors.js';
import {
  requireAuth,
  requireRole,
  signedInUser,
  type AuthDependencies,
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  settleCharge,
  startCharge,
  type ChargeDependencies,
  type ChargeTarget,
} from '../payments/charges.js';
import { maskReference } from '../payments/gateway.js';
import { successfulChargeFromEvent } from '../payments/paystackGateway.js';
import { chargeAndBookingStatus, findFarmerCharge } from '../payments/store.js';

export interface PaymentRouteDependencies extends AuthDependencies, ChargeDependencies {
  logger: Logger;
  tasks: BackgroundTasks;
}

const referenceParamsSchema = z.object({ reference: paymentReferenceSchema });
type ReferenceParams = z.infer<typeof referenceParamsSchema>;

function invalidSignature(): AppError {
  return new AppError('unauthorized', 'The webhook signature is missing or invalid');
}

function parseEvent(rawBody: Buffer): unknown {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new AppError('bad_request', 'The request body is not valid JSON');
  }
}

export function paymentRoutes(deps: PaymentRouteDependencies): Router {
  const { db, gateway, tasks } = deps;
  const router = Router();
  const farmerOnly = [requireAuth(deps), requireRole('farmer')];

  router.post(
    '/payments/initialize',
    ...farmerOnly,
    validate({ body: initializePaymentBodySchema }),
    async (req, res) => {
      const body = req.body as z.infer<typeof initializePaymentBodySchema>;
      const target: ChargeTarget =
        'booking_id' in body
          ? { bookingId: body.booking_id }
          : { deliveryRequestId: body.delivery_request_id };
      const user = signedInUser(req);
      const charge = await startCharge(deps, { id: user.id, coldlinkId: user.coldlink_id }, target);
      const initialized: InitializedPayment = {
        authorization_url: charge.authorizationUrl,
        reference: charge.reference,
      };
      res.set('Cache-Control', 'no-store').json(initialized);
    },
  );

  // Paystack cannot reach localhost, so in development this is how a payment is confirmed; in
  // production it confirms what the webhook may already have (PRD 7.5).
  router.get(
    '/payments/:reference/verify',
    ...farmerOnly,
    validate({ params: referenceParamsSchema }),
    async (req, res) => {
      const { reference } = req.params as ReferenceParams;
      const payment = await findFarmerCharge(db, signedInUser(req).id, reference);
      if (payment === undefined) throw new AppError('not_found', 'Payment not found');

      if (payment.status === 'initiated') {
        const charge = await gateway.verify(reference);
        if (charge.status === 'success') {
          const settled = await settleCharge({ ...deps, logger: req.log }, charge);
          if (settled.outcome.kind === 'mismatch') {
            throw new AppError('conflict', 'The payment does not match the booking', {
              reference,
            });
          }
          // The farmer is waiting to learn the outcome, including a late payment's refund.
          await settled.afterCommit();
        }
      }

      const current = await chargeAndBookingStatus(db, reference);
      const body: PaymentVerification = {
        reference,
        payment_status: paymentStatusSchema.parse(current.payment_status),
        booking_id: current.id,
        booking_status: bookingStatusSchema.parse(current.status),
        delivery_request_id: current.delivery_request_id,
      };
      res.set('Cache-Control', 'no-store').json(body);
    },
  );

  // Takes the raw body (app.ts), since the signature is over the exact bytes Paystack sent. The
  // body is never logged. Paystack retries anything but a 200, so the database work is done before
  // answering and the external work after.
  router.post('/webhooks/paystack', async (req, res) => {
    const rawBody: unknown = req.body;
    const signature = req.get('x-paystack-signature');
    if (!Buffer.isBuffer(rawBody) || !gateway.isSignedWebhook(rawBody, signature)) {
      req.log.warn('Paystack webhook refused: signature missing or invalid');
      throw invalidSignature();
    }
    const charge = successfulChargeFromEvent(parseEvent(rawBody));
    if (charge !== undefined) {
      const settled = await settleCharge({ ...deps, logger: req.log }, charge);
      tasks.run(
        req.log,
        `Finishing a Paystack charge failed (${maskReference(charge.reference)})`,
        settled.afterCommit,
      );
    }
    res.json({ received: true });
  });

  return router;
}
