import { deliveryActionPath } from '@coldlink/shared';
import type { Transaction } from 'kysely';
import { issueDeliveryToken, type DeliveryTokenPurpose } from '../actions/tokens.js';
import type { Database } from '../db/client.js';
import type { DB } from '../db/schema.js';
import { inTransaction } from '../db/transaction.js';
import type { DeliverySmsTemplateDependencies } from '../notifications/deliveryTemplates.js';
import { databaseNow } from './partnerStore.js';
import { deliveryTokenExpiresAt } from './tokenLifetimes.js';

/** The delivery statuses in which each link still has something to do. */
const statusesFor: Record<DeliveryTokenPurpose, string[]> = {
  delivery_accept: ['assigned'],
  delivery_update: ['accepted', 'picked_up'],
};

export interface DeliveryLinks extends DeliverySmsTemplateDependencies {
  /** Issues a token for the delivery and returns the link that carries it. */
  issue(
    trx: Transaction<DB>,
    delivery: { id: string; scheduled_for: Date | null },
    purpose: DeliveryTokenPurpose,
  ): Promise<string>;
}

/**
 * The partner's links (decision 149). As for the provider's (decision 104), the link is the only
 * copy of its token: neither is stored or logged, and a resend issues a fresh one, but only while
 * the same partner still has that step of the job to do.
 */
export function createDeliveryLinks(db: Database, webAppUrl: string): DeliveryLinks {
  const issue: DeliveryLinks['issue'] = async (trx, delivery, purpose) => {
    const expiresAt = deliveryTokenExpiresAt(
      purpose,
      delivery.scheduled_for,
      await databaseNow(trx),
    );
    const token = await issueDeliveryToken(trx, delivery.id, purpose, expiresAt);
    return new URL(deliveryActionPath(token), webAppUrl).toString();
  };

  const reissue = (purpose: DeliveryTokenPurpose) => (deliveryId: string, partnerId: string) =>
    inTransaction(db, async (trx) => {
      const delivery = await trx
        .selectFrom('delivery_requests')
        .select(['id', 'scheduled_for'])
        .where('id', '=', deliveryId)
        .where('partner_id', '=', partnerId)
        .where('status', 'in', statusesFor[purpose])
        .forUpdate()
        .executeTakeFirst();
      return delivery === undefined ? undefined : issue(trx, delivery, purpose);
    });

  return {
    issue,
    relinkJob: reissue('delivery_accept'),
    relinkUpdate: reissue('delivery_update'),
    handoverCodeForResend: async (deliveryId) => {
      const row = await db
        .selectFrom('delivery_requests')
        .select('handover_code')
        .where('id', '=', deliveryId)
        .where('status', '=', 'picked_up')
        .executeTakeFirst();
      return row?.handover_code;
    },
  };
}
