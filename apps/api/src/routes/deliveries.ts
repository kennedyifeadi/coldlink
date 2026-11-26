import {
  bookingStatusSchema,
  createDeliveryBodySchema,
  deliveryQuoteBodySchema,
  todayInLagos,
  type BookingDates,
  type CancelledDelivery,
  type CreateDeliveryInput,
  type DeliveryDirection,
  type DeliveryQuoteInput,
  type GeoPoint,
} from '@coldlink/shared';
import { Router, type Request, type RequestHandler } from 'express';
import * as z from 'zod';
import type { AppConfigReader } from '../appConfig.js';
import { BookingNotFoundError } from '../bookings/transition.js';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { generateHandoverCode } from '../deliveries/handoverCode.js';
import { refundCancelledDeliveries } from '../deliveries/hooks.js';
import {
  checkScheduledFor,
  openWindow,
  priceDelivery,
  toDeliveryQuote,
} from '../deliveries/pricing.js';
import { acceptsDelivery } from '../deliveries/rules.js';
import {
  cancelDeliveries,
  findFarmerDelivery,
  insertDelivery,
  isOpenDeliveryStatus,
  listActiveDeliveries,
  lockDelivery,
  requireFarmerDelivery,
  type FacilityEnd,
} from '../deliveries/store.js';
import { toFarmerDelivery } from '../deliveries/views.js';
import { AppError, invalidBody } from '../errors.js';
import {
  optionalAuth,
  requireAuth,
  requireRole,
  signedInUser,
  type AuthDependencies,
} from '../middleware/auth.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import type { PaymentGateway } from '../payments/gateway.js';
import { findProvider } from '../providers/store.js';
import { isBookable } from '../providers/visibility.js';

/** As the booking quote's (decision 75): a farmer moving the pin asks again and again. */
export const defaultDeliveryQuoteIpLimit: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  limit: 300,
};

/** Requesting, reading and cancelling deliveries (decision 146). */
export const defaultDeliveryIpLimit: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 120 };

export interface DeliveryRouteDependencies extends AuthDependencies {
  appConfig: AppConfigReader;
  gateway: PaymentGateway;
  quoteIpLimit: RateLimitOptions;
  ipLimit: RateLimitOptions;
  now?: () => Date;
}

const deliveryParamsSchema = z.object({ id: z.uuid() });
type DeliveryParams = z.infer<typeof deliveryParamsSchema>;

interface DeliveryBooking extends BookingDates {
  id: string;
  status: ReturnType<typeof bookingStatusSchema.parse>;
  facility: FacilityEnd;
}

/** The farmer's booking and its facility, optionally locked, or the same 404 for anyone else's. */
async function farmerBooking(
  db: Database,
  farmerId: string,
  bookingId: string,
  lock: boolean,
): Promise<DeliveryBooking> {
  const query = db
    .selectFrom('bookings')
    .select(['id', 'status', 'provider_id', 'start_date', 'end_date'])
    .where('id', '=', bookingId)
    .where('farmer_id', '=', farmerId);
  const booking = await (lock ? query.forUpdate() : query).executeTakeFirst();
  if (booking === undefined) throw new BookingNotFoundError(bookingId);
  const provider = await findProvider(db, booking.provider_id);
  if (provider === undefined) throw new Error(`Booking ${bookingId} has no facility`);
  return {
    id: booking.id,
    status: bookingStatusSchema.parse(booking.status),
    start_date: booking.start_date,
    end_date: booking.end_date,
    facility: provider,
  };
}

/** A 409 unless the booking takes a delivery in that direction now (decision 141). */
function checkAccepts(booking: DeliveryBooking, direction: DeliveryDirection): void {
  if (!acceptsDelivery(direction, booking.status)) {
    throw new AppError('conflict', `This booking cannot take an ${direction} delivery now`, {
      booking_id: booking.id,
      status: booking.status,
      direction,
    });
  }
}

/** Where a quote's other end is and when it can be scheduled, for a booking or a facility. */
async function quoteTarget(
  deps: DeliveryRouteDependencies,
  req: Request,
  input: DeliveryQuoteInput,
  now: Date,
): Promise<{ facility: GeoPoint; dates: BookingDates; bookingId?: string }> {
  if (input.booking_id !== undefined) {
    // Only the signed-in farmer's own booking; anyone else, signed in or not, gets the 404.
    const user = req.user;
    if (user === undefined) throw new BookingNotFoundError(input.booking_id);
    const booking = await farmerBooking(deps.db, user.id, input.booking_id, false);
    checkAccepts(booking, input.direction);
    return { facility: booking.facility, dates: booking, bookingId: booking.id };
  }
  const providerId = input.provider_id ?? '';
  const provider = await findProvider(deps.db, providerId);
  if (provider === undefined || !isBookable(provider, await deps.appConfig.get())) {
    throw new AppError('not_found', 'Facility not found');
  }
  const today = todayInLagos(now);
  const start = input.start_date ?? today;
  if (start < today) throw invalidBody('start_date', 'Choose today or a later date');
  return { facility: provider, dates: { start_date: start, end_date: start } };
}

export function deliveryRoutes(deps: DeliveryRouteDependencies): Router {
  const { db, appConfig, gateway, now = () => new Date() } = deps;
  const router = Router();
  const farmerOnly = [rateLimit(deps.ipLimit), requireAuth(deps), requireRole('farmer')];
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };

  // Reads only, open as the booking quote is (decision 75); a booking_id quote needs its farmer.
  router.post(
    '/deliveries/quote',
    rateLimit(deps.quoteIpLimit),
    optionalAuth(deps),
    validate({ body: deliveryQuoteBodySchema }),
    async (req, res) => {
      const input = req.body as DeliveryQuoteInput;
      const at = now();
      const target = await quoteTarget(deps, req, input, at);
      const window = openWindow(input.direction, { ...target.dates, id: target.bookingId }, at);
      const price = priceDelivery(input, target.facility, await appConfig.get());
      res.json(toDeliveryQuote(input.direction, price, window));
    },
  );

  // A later delivery is created requested and unpaid, and is paid through POST
  // /payments/initialize (decision 143). An unpaid one in the same direction is replaced; a paid
  // one is a 409 (decision 141).
  router.post(
    '/deliveries',
    ...farmerOnly,
    noStore,
    validate({ body: createDeliveryBodySchema }),
    async (req, res) => {
      const input = req.body as CreateDeliveryInput;
      const farmerId = signedInUser(req).id;
      const config = await appConfig.get();
      const at = now();

      const deliveryId = await inTransaction(db, async (trx) => {
        const booking = await farmerBooking(trx, farmerId, input.booking_id, true);
        checkAccepts(booking, input.direction);
        const window = openWindow(input.direction, booking, at);
        checkScheduledFor(window, input.scheduled_for, 'scheduled_for');

        const active = await listActiveDeliveries(trx, booking.id, input.direction);
        const paid = active.find((delivery) => delivery.paid_at !== null);
        if (paid !== undefined) {
          throw new AppError(
            'conflict',
            `This booking already has an ${input.direction} delivery`,
            {
              booking_id: booking.id,
              delivery_request_id: paid.id,
            },
          );
        }
        await cancelDeliveries(
          trx,
          active.map((delivery) => delivery.id),
        );
        return insertDelivery(trx, {
          bookingId: booking.id,
          farmerId,
          direction: input.direction,
          details: input,
          facility: booking.facility,
          price: priceDelivery(input, booking.facility, config),
          handoverCode: generateHandoverCode(),
        });
      });
      const delivery = await requireFarmerDelivery(db, farmerId, deliveryId);
      res.status(201).json(toFarmerDelivery(delivery));
    },
  );

  // Someone else's delivery is the same 404 as an unknown id, so ids cannot be probed.
  router.get(
    '/deliveries/:id',
    ...farmerOnly,
    noStore,
    validate({ params: deliveryParamsSchema }),
    async (req, res) => {
      const { id } = req.params as DeliveryParams;
      const delivery = await findFarmerDelivery(db, signedInUser(req).id, id);
      if (delivery === undefined) throw new AppError('not_found', 'Delivery not found');
      res.json(toFarmerDelivery(delivery));
    },
  );

  // Allowed until pickup; a paid fee is refunded in full after the commit, and admins are alerted
  // (decision 144).
  router.post(
    '/deliveries/:id/cancel',
    ...farmerOnly,
    noStore,
    validate({ params: deliveryParamsSchema }),
    async (req, res) => {
      const { id } = req.params as DeliveryParams;
      const farmerId = signedInUser(req).id;
      const found = await findFarmerDelivery(db, farmerId, id);
      if (found === undefined) throw new AppError('not_found', 'Delivery not found');

      const refundKobo = await inTransaction(db, async (trx) => {
        const booking = await farmerBooking(trx, farmerId, found.context_id, true);
        const delivery = await lockDelivery(trx, id);
        const details = { delivery_request_id: id, status: delivery.status };
        if (!isOpenDeliveryStatus(delivery.status)) {
          throw new AppError('conflict', 'This delivery can no longer be cancelled', details);
        }
        // Its fee is part of the booking's charge, which the farmer may still pay; letting the hold
        // lapse cancels both (decision 144).
        if (booking.status === 'payment_pending') {
          throw new AppError(
            'conflict',
            'This delivery is part of a booking awaiting payment. Pay for the booking first, or let it lapse.',
            details,
          );
        }
        await cancelDeliveries(trx, [id]);
        return delivery.paid_at === null ? 0 : delivery.fee_kobo;
      });

      if (refundKobo > 0) {
        await refundCancelledDeliveries(
          { db, gateway, logger: req.log },
          found.context_id,
          'farmer_cancelled',
        );
      }
      const body: CancelledDelivery = {
        ...toFarmerDelivery(await requireFarmerDelivery(db, farmerId, id)),
        refund_kobo: refundKobo,
      };
      res.json(body);
    },
  );

  return router;
}
