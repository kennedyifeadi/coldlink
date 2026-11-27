import { timingSafeEqual } from 'node:crypto';
import {
  capacityUnitSchema,
  deliveryStatusSchema,
  HANDOVER_CODE_MAX_ATTEMPTS,
  todayInLagos,
  vehicleTypeSchema,
  type DeliveryStatus,
  type PartnerDeliveryActionBody,
  type PartnerDeliveryActionResult,
} from '@coldlink/shared';
import { sql, type Transaction, type UpdateObject } from 'kysely';
import type { Logger } from 'pino';
import { linkNotFound } from '../actions/linkNotFound.js';
import {
  findDeliveryToken,
  lockDeliveryToken,
  markTokenUsed,
  revokeDeliveryTokens,
  type DeliveryTokenPurpose,
} from '../actions/tokens.js';
import type { DB } from '../db/schema.js';
import { AppError, invalidBody } from '../errors.js';
import type { SmsTemplateRegistry } from '../notifications/registry.js';
import {
  deliver,
  queueNotification,
  type Delivery,
  type NotificationDeps,
  type NotificationRequest,
} from '../notifications/send.js';
import { createNotificationStore } from '../notifications/store.js';
import { alertDeliveryDeclined, alertHandoverLocked, type PartnerAlert } from './alerts.js';
import type { DeliveryLinks } from './partnerLinks.js';
import {
  findDeliveryBookingId,
  findPartner,
  lockDeliveryBooking,
  readDeliverySmsFacts,
  readHandoverCode,
  readPartnerJob,
  type DeliverySmsFacts,
} from './partnerStore.js';
import { handoverAttemptsLeft, toPartnerJob } from './partnerViews.js';
import { directionOf, lockDelivery, type LockedDelivery } from './store.js';

export interface DeliveryMoveDependencies {
  links: DeliveryLinks;
  templates: SmsTemplateRegistry;
}

/** What a move leaves to do once it has committed: SMS it queued, and alerts to raise. */
export interface MoveEffects {
  sms: Delivery[];
  alerts: { kind: 'declined' | 'handover_locked'; alert: PartnerAlert }[];
}

type Registry = SmsTemplateRegistry;
type TemplateName = Extract<keyof Registry, string>;
type SmsRequest = { [Name in TemplateName]: NotificationRequest<Registry, Name> }[TemplateName];

/**
 * Logs the SMS as queued in the move's own transaction, so it commits or rolls back with the move;
 * finishMove sends it after the commit, and the queue does if that send never happens.
 */
function queueSms(
  trx: Transaction<DB>,
  templates: Registry,
  request: SmsRequest,
): Promise<Delivery> {
  return queueNotification({ store: createNotificationStore(trx), templates }, request);
}

/** Sends the move's SMS and raises its alerts. Never throws: the move has already happened. */
export async function finishMove(
  notifications: NotificationDeps<Registry>,
  logger: Logger,
  effects: MoveEffects,
): Promise<void> {
  for (const { kind, alert } of effects.alerts) {
    if (kind === 'declined') alertDeliveryDeclined(logger, alert);
    else alertHandoverLocked(logger, alert);
  }
  for (const sms of effects.sms) {
    try {
      await deliver(notifications, sms);
    } catch (err) {
      logger.error(
        { err, notificationId: sms.id, template: sms.template },
        'Delivery SMS was not sent; the queue will retry it',
      );
    }
  }
}

const conflictMessages: Partial<Record<DeliveryStatus, string>> = {
  requested: 'This delivery has no partner yet',
  assigned: 'This delivery is waiting for its partner to accept',
  accepted: 'The partner has already accepted this delivery',
  picked_up: 'This delivery has already been picked up',
  delivered: 'This delivery has already been delivered',
  cancelled: 'This delivery was cancelled',
  failed: 'This delivery failed',
};

function movedOn(delivery: LockedDelivery): AppError {
  const status = deliveryStatusSchema.parse(delivery.status);
  return new AppError('conflict', conflictMessages[status] ?? 'This delivery has moved on', {
    delivery_request_id: delivery.id,
    status,
  });
}

/** Locks the booking, then the delivery: the order every delivery path takes. */
async function lockForMove(trx: Transaction<DB>, deliveryId: string): Promise<LockedDelivery> {
  const found = await findDeliveryBookingId(trx, deliveryId);
  if (found === undefined) throw new AppError('not_found', 'Delivery not found');
  await lockDeliveryBooking(trx, found.bookingId);
  return lockDelivery(trx, deliveryId);
}

function partnerOf(facts: DeliverySmsFacts) {
  if (facts.partner_id === null || facts.partner_phone === null || facts.partner_user_id === null) {
    throw new Error(`Delivery ${facts.id} has no partner`);
  }
  return {
    id: facts.partner_id,
    phone: facts.partner_phone,
    userId: facts.partner_user_id,
    companyName: facts.partner_company_name ?? '',
  };
}

function scheduledDay(facts: Pick<DeliverySmsFacts, 'id' | 'scheduled_for'>): string {
  if (facts.scheduled_for === null) throw new Error(`Delivery ${facts.id} has no scheduled day`);
  return todayInLagos(facts.scheduled_for);
}

function farmerUpdate(
  facts: DeliverySmsFacts,
  kind: 'accepted' | 'picked_up' | 'delivered',
  extra: { partner_name?: string; handover_code?: string } = {},
): SmsRequest {
  return {
    template: 'delivery_update',
    params: {
      delivery_id: facts.id,
      booking_code: facts.booking_code,
      scheduled_for: scheduledDay(facts),
      kind,
      ...extra,
    },
    to: facts.farmer_phone,
    userId: facts.farmer_id,
  };
}

/** The `delivery_cancelled` SMS to the partner who had the job (decision 148). */
export function partnerCancelledSms(
  facts: Pick<DeliverySmsFacts, 'id' | 'booking_code' | 'scheduled_for'>,
  partner: { phone: string; userId: string },
): SmsRequest {
  return {
    template: 'delivery_cancelled',
    params: { booking_code: facts.booking_code, scheduled_for: scheduledDay(facts) },
    to: partner.phone,
    userId: partner.userId,
  };
}

/** Queues `delivery_cancelled` to the partner each cancelled delivery had, if it had one. */
export async function queuePartnerCancellations(
  trx: Transaction<DB>,
  templates: Registry,
  cancelled: readonly { id: string; partner_id: string | null }[],
): Promise<Delivery[]> {
  const queued: Delivery[] = [];
  for (const delivery of cancelled) {
    if (delivery.partner_id === null) continue;
    const facts = await readDeliverySmsFacts(trx, delivery.id);
    queued.push(await queueSms(trx, templates, partnerCancelledSms(facts, partnerOf(facts))));
  }
  return queued;
}

export interface AssignRequest {
  deliveryId: string;
  partnerId: string;
}

/**
 * Assigns a live, `requested` delivery to a partner, or reassigns one still `assigned` (decisions
 * 147, 153): the old partner's links are revoked and they are told the job is off, and the new
 * partner gets `delivery_job` with a fresh accept link.
 */
export async function assignDelivery(
  trx: Transaction<DB>,
  { links, templates }: DeliveryMoveDependencies,
  { deliveryId, partnerId }: AssignRequest,
): Promise<MoveEffects> {
  const delivery = await lockForMove(trx, deliveryId);
  if (delivery.status !== 'requested' && delivery.status !== 'assigned') throw movedOn(delivery);
  if (delivery.paid_at === null) {
    throw new AppError('conflict', 'This delivery has not been paid for', {
      delivery_request_id: delivery.id,
      status: delivery.status,
    });
  }
  const partner = await findPartner(trx, partnerId);
  if (partner === undefined) throw invalidBody('partner_id', 'No delivery partner has this id');
  if (!partner.is_active) throw invalidBody('partner_id', 'This delivery partner is not active');
  if (!partner.vehicle_types.includes(delivery.vehicle_type)) {
    throw invalidBody('partner_id', `This delivery needs a ${delivery.vehicle_type}`);
  }

  const sms: Delivery[] = [];
  if (delivery.partner_id !== null && delivery.partner_id !== partnerId) {
    const before = await readDeliverySmsFacts(trx, deliveryId);
    sms.push(await queueSms(trx, templates, partnerCancelledSms(before, partnerOf(before))));
  }
  await revokeDeliveryTokens(trx, deliveryId);
  await trx
    .updateTable('delivery_requests')
    .set({ status: 'assigned', partner_id: partnerId, assigned_at: sql<Date>`now()` })
    .where('id', '=', deliveryId)
    .execute();

  const link = await links.issue(trx, delivery, 'delivery_accept');
  const facts = await readDeliverySmsFacts(trx, deliveryId);
  sms.push(
    await queueSms(trx, templates, {
      template: 'delivery_job',
      params: {
        delivery_id: deliveryId,
        partner_id: partnerId,
        booking_code: facts.booking_code,
        direction: directionOf(facts.context_type),
        scheduled_for: scheduledDay(facts),
        load_quantity: facts.load_quantity,
        load_unit: capacityUnitSchema.parse(facts.load_unit),
        vehicle_type: vehicleTypeSchema.parse(facts.vehicle_type),
        distance_km: facts.distance_km,
        facility_name: facts.facility_name,
        payout_kobo: facts.partner_payout_kobo,
        link,
      },
      to: partner.phone,
      userId: partner.user_id,
    }),
  );
  return { sms, alerts: [] };
}

const purposeFor: Record<PartnerDeliveryActionBody['action'], DeliveryTokenPurpose> = {
  accept: 'delivery_accept',
  decline: 'delivery_accept',
  picked_up: 'delivery_update',
  delivered: 'delivery_update',
};

const requiredStatus: Record<PartnerDeliveryActionBody['action'], DeliveryStatus> = {
  accept: 'assigned',
  decline: 'assigned',
  picked_up: 'accepted',
  delivered: 'picked_up',
};

export type PartnerLinkOutcome =
  | { kind: 'moved'; result: PartnerDeliveryActionResult; effects: MoveEffects }
  | { kind: 'wrong_code'; attemptsLeft: number; effects: MoveEffects };

function codesMatch(stored: string, given: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * One move from a partner's link (decision 147). The token is read first only to find the
 * delivery; it is locked and checked again after the booking and the delivery, so a second tap, a
 * reassignment or a farmer's cancellation made meanwhile is seen. A wrong handover code is counted
 * and committed, and answered after the commit.
 */
export async function performPartnerLinkAction(
  trx: Transaction<DB>,
  { links, templates }: DeliveryMoveDependencies,
  token: string,
  body: PartnerDeliveryActionBody,
): Promise<PartnerLinkOutcome> {
  const found = await findDeliveryToken(trx, token);
  if (found === undefined || found.purpose !== purposeFor[body.action]) throw linkNotFound();
  const delivery = await lockForMove(trx, found.deliveryId);
  const locked = await lockDeliveryToken(trx, token);
  if (locked === undefined) throw linkNotFound();
  if (delivery.status !== requiredStatus[body.action]) throw movedOn(delivery);

  const id = delivery.id;
  const facts = await readDeliverySmsFacts(trx, id);
  const partner = partnerOf(facts);
  const alertFacts = {
    bookingId: delivery.context_id,
    deliveryRequestId: id,
    partnerId: partner.id,
  };
  const update = (changes: UpdateObject<DB, 'delivery_requests'>) =>
    trx.updateTable('delivery_requests').set(changes).where('id', '=', id).execute();
  const job = async () => toPartnerJob(await readPartnerJob(trx, id));
  const sms: Delivery[] = [];

  switch (body.action) {
    case 'accept': {
      await update({ status: 'accepted' });
      await markTokenUsed(trx, locked.id);
      const link = await links.issue(trx, delivery, 'delivery_update');
      sms.push(
        await queueSms(trx, templates, {
          template: 'delivery_partner_link',
          params: {
            delivery_id: id,
            partner_id: partner.id,
            booking_code: facts.booking_code,
            scheduled_for: scheduledDay(facts),
            link,
          },
          to: partner.phone,
          userId: partner.userId,
        }),
        await queueSms(
          trx,
          templates,
          farmerUpdate(facts, 'accepted', { partner_name: partner.companyName }),
        ),
      );
      return {
        kind: 'moved',
        result: { outcome: 'accepted', job: await job() },
        effects: { sms, alerts: [] },
      };
    }
    case 'decline': {
      await update({ status: 'requested', partner_id: null, assigned_at: null });
      await markTokenUsed(trx, locked.id);
      return {
        kind: 'moved',
        result: { outcome: 'declined', job: null },
        effects: { sms, alerts: [{ kind: 'declined', alert: alertFacts }] },
      };
    }
    case 'picked_up': {
      await update({ status: 'picked_up', picked_up_at: sql<Date>`now()` });
      const handoverCode = await readHandoverCode(trx, id);
      sms.push(
        await queueSms(
          trx,
          templates,
          farmerUpdate(facts, 'picked_up', { handover_code: handoverCode }),
        ),
      );
      return {
        kind: 'moved',
        result: { outcome: 'picked_up', job: await job() },
        effects: { sms, alerts: [] },
      };
    }
    case 'delivered': {
      if (delivery.handover_failed_attempts >= HANDOVER_CODE_MAX_ATTEMPTS) {
        throw new AppError('conflict', 'This link takes no more handover codes', {
          delivery_request_id: id,
          status: delivery.status,
          handover_attempts_left: 0,
        });
      }
      if (!codesMatch(await readHandoverCode(trx, id), body.handover_code)) {
        const { handover_failed_attempts: failed } = await trx
          .updateTable('delivery_requests')
          .set({ handover_failed_attempts: sql<number>`handover_failed_attempts + 1` })
          .where('id', '=', id)
          .returning('handover_failed_attempts')
          .executeTakeFirstOrThrow();
        const attemptsLeft = handoverAttemptsLeft(failed);
        return {
          kind: 'wrong_code',
          attemptsLeft,
          effects: {
            sms,
            alerts: attemptsLeft === 0 ? [{ kind: 'handover_locked', alert: alertFacts }] : [],
          },
        };
      }
      await update({ status: 'delivered', delivered_at: sql<Date>`now()` });
      await markTokenUsed(trx, locked.id);
      sms.push(await queueSms(trx, templates, farmerUpdate(facts, 'delivered')));
      return {
        kind: 'moved',
        result: { outcome: 'delivered', job: await job() },
        effects: { sms, alerts: [] },
      };
    }
  }
}
