import {
  bookingQuoteBodySchema,
  bookingStatusSchema,
  cancelBookingBodySchema,
  createBookingBodySchema,
  farmerCancellationRefundKobo,
  isFarmerCancellable,
  type BookingQuote,
  type BookingQuoteInput,
  type CancelBookingInput,
  type CancelledBooking,
  type CreateBookingInput,
  type FarmerBookingsResponse,
} from '@coldlink/shared';
import { Router } from 'express';
import * as z from 'zod';
import type { AppConfigReader } from '../appConfig.js';
import { generateBookingCode } from '../bookings/code.js';
import type { TransitionHooks } from '../bookings/hooks.js';
import { priceBooking, type PricedBooking } from '../bookings/pricing.js';
import {
  findFarmerBooking,
  insertBooking,
  listFarmerBookings,
  lockFarmerBooking,
  recordBookingCreated,
  requireFarmerBooking,
} from '../bookings/store.js';
import {
  BookingNotFoundError,
  runAfterCommitHooks,
  transitionBooking,
} from '../bookings/transition.js';
import { toFarmerBooking, toFarmerBookingSummary } from '../bookings/views.js';
import { inTransaction } from '../db/transaction.js';
import { invalidBody } from '../errors.js';
import {
  optionalAuth,
  requireAuth,
  requireRole,
  signedInUser,
  type AuthDependencies,
} from '../middleware/auth.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { lockProvider } from '../providers/store.js';
import { findCropCategoryId } from '../search/store.js';
import { storagePeriod, type StoragePeriod } from '../storagePeriod.js';

// As loose as search (decision 74): a farmer adjusting quantity and days asks for several quotes.
export const defaultQuoteIpLimit: RateLimitOptions = { windowMs: 15 * 60 * 1000, limit: 300 };

export interface BookingRouteDependencies extends AuthDependencies {
  appConfig: AppConfigReader;
  hooks: TransitionHooks;
  quoteIpLimit: RateLimitOptions;
  now?: () => Date;
  generateCode?: () => string;
}

const bookingParamsSchema = z.object({ id: z.uuid() });
type BookingParams = z.infer<typeof bookingParamsSchema>;

function toQuote(
  input: BookingQuoteInput,
  period: StoragePeriod,
  { provider, available, pricing }: PricedBooking,
): BookingQuote {
  return {
    provider_id: provider.id,
    quantity: input.quantity,
    capacity_unit: provider.capacity_unit,
    start_date: period.startDate,
    duration_days: input.days,
    end_date: period.endDate,
    available_quantity: available,
    unit_price_kobo: provider.price_per_unit_per_day_kobo,
    storage_subtotal_kobo: pricing.storage_subtotal_kobo,
    deposit_kobo: pricing.deposit_kobo,
    balance_due_kobo: pricing.balance_due_kobo,
    service_fee_kobo: pricing.service_fee_kobo,
    delivery_fee_kobo: pricing.delivery_fee_kobo,
    total_charged_online_kobo: pricing.total_charged_online_kobo,
  };
}

export function bookingRoutes(deps: BookingRouteDependencies): Router {
  const {
    db,
    appConfig,
    hooks,
    quoteIpLimit,
    now = () => new Date(),
    generateCode = generateBookingCode,
  } = deps;
  const router = Router();
  const farmerOnly = [requireAuth(deps), requireRole('farmer')];

  // Reads only: a quote holds no capacity and writes no row (PRD 8).
  router.post(
    '/bookings/quote',
    rateLimit(quoteIpLimit),
    optionalAuth(deps),
    validate({ body: bookingQuoteBodySchema }),
    async (req, res) => {
      const input = req.body as BookingQuoteInput;
      const period = storagePeriod(input.start_date, input.days, now());
      const config = await appConfig.get();
      const priced = await priceBooking(db, input, period, config);
      res.json(toQuote(input, period, priced));
    },
  );

  // PRD 6.3: the provider's row is locked before its visibility, terms and free capacity are
  // checked, so two farmers racing for the last space are served one after the other.
  router.post(
    '/bookings',
    ...farmerOnly,
    validate({ body: createBookingBodySchema }),
    async (req, res) => {
      const input = req.body as CreateBookingInput;
      const farmerId = signedInUser(req).id;
      const period = storagePeriod(input.start_date, input.days, now());
      const cropCategoryId = await findCropCategoryId(db, input.crop_id);
      if (cropCategoryId === undefined) throw invalidBody('crop_id', 'Unknown crop');
      const config = await appConfig.get();

      const booking = await inTransaction(db, async (trx) => {
        await lockProvider(trx, input.provider_id);
        const { provider, pricing } = await priceBooking(
          trx,
          { ...input, cropCategoryId },
          period,
          config,
        );
        const id = await insertBooking(
          trx,
          {
            farmerId,
            providerId: provider.id,
            cropId: input.crop_id,
            quantity: input.quantity,
            capacityUnit: provider.capacity_unit,
            period,
            days: input.days,
            unitPriceKobo: provider.price_per_unit_per_day_kobo,
            pricing,
            config,
          },
          generateCode,
        );
        await recordBookingCreated(trx, id, farmerId);
        return requireFarmerBooking(trx, farmerId, id);
      });
      res.status(201).set('Cache-Control', 'no-store').json(toFarmerBooking(booking));
    },
  );

  router.get('/bookings', ...farmerOnly, async (req, res) => {
    const bookings = await listFarmerBookings(db, signedInUser(req).id);
    const body: FarmerBookingsResponse = { data: bookings.map(toFarmerBookingSummary) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  // Someone else's booking is the same 404 as an unknown id, so ids cannot be probed.
  router.get(
    '/bookings/:id',
    ...farmerOnly,
    validate({ params: bookingParamsSchema }),
    async (req, res) => {
      const { id } = req.params as BookingParams;
      const booking = await findFarmerBooking(db, signedInUser(req).id, id);
      if (booking === undefined) throw new BookingNotFoundError(id);
      res.set('Cache-Control', 'no-store').json(toFarmerBooking(booking));
    },
  );

  // The refund depends on the status, so it is worked out under the row lock the change takes.
  router.post(
    '/bookings/:id/cancel',
    ...farmerOnly,
    validate({ params: bookingParamsSchema, body: cancelBookingBodySchema }),
    async (req, res) => {
      const { id } = req.params as BookingParams;
      const { reason } = req.body as CancelBookingInput;
      const farmerId = signedInUser(req).id;
      const { farmer_free_cancel_hours } = await appConfig.get();

      const { result, booking, refundKobo } = await inTransaction(db, async (trx) => {
        const locked = await lockFarmerBooking(trx, farmerId, id);
        if (locked === undefined) throw new BookingNotFoundError(id);
        const status = bookingStatusSchema.parse(locked.status);
        // transitionBooking refuses every other status with a 409, so this 0 is never stored.
        const refund = isFarmerCancellable(status)
          ? farmerCancellationRefundKobo({ ...locked, status }, now(), farmer_free_cancel_hours)
          : 0;
        const transition = await transitionBooking(trx, hooks, {
          bookingId: id,
          to: 'cancelled',
          actor: { type: 'farmer', id: farmerId },
          ...(reason === undefined ? {} : { reason }),
          metadata: { refund_kobo: refund },
        });
        return {
          result: transition,
          booking: await requireFarmerBooking(trx, farmerId, id),
          refundKobo: refund,
        };
      });
      await runAfterCommitHooks(req.log, result);

      const body: CancelledBooking = { ...toFarmerBooking(booking), refund_kobo: refundKobo };
      res.set('Cache-Control', 'no-store').json(body);
    },
  );

  return router;
}
