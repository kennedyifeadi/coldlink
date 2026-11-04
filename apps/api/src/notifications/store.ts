import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import type { Json, JsonObject } from '../db/schema.js';
import { RETRY_DELAYS_MS } from './retryPolicy.js';

export interface NewNotification {
  userId: string | null;
  recipientPhone: string;
  template: string;
  payload: JsonObject;
}

export interface QueuedNotification {
  id: string;
  recipientPhone: string;
  template: string;
  payload: Json;
  attempts: number;
}

/** The `notifications` table. Each mark counts one more attempt. */
export interface NotificationStore {
  /** Logs an SMS as queued and returns its id. */
  insert(notification: NewNotification): Promise<string>;
  markSent(id: string, providerMessageId: string): Promise<void>;
  /** Keeps it queued for another attempt. */
  markRetry(id: string, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /**
   * Takes up to `limit` queued messages whose retry delay has passed, oldest first, and holds
   * them for at least a minute so no other worker sends them meanwhile.
   */
  claimDue(limit: number): Promise<QueuedNotification[]>;
}

export function createNotificationStore(db: Database): NotificationStore {
  async function mark(
    id: string,
    changes: { status: 'sent' | 'queued' | 'failed'; error?: string; providerMessageId?: string },
  ): Promise<void> {
    const { numUpdatedRows } = await db
      .updateTable('notifications')
      .set((eb) => ({
        status: changes.status,
        attempts: eb('attempts', '+', 1),
        ...(changes.error === undefined ? {} : { error: changes.error }),
        ...(changes.providerMessageId === undefined
          ? {}
          : { provider_message_id: changes.providerMessageId, sent_at: sql<Date>`now()` }),
      }))
      .where('id', '=', id)
      .where('status', '=', 'queued')
      .executeTakeFirstOrThrow();
    if (numUpdatedRows === 0n) throw new Error(`Notification ${id} is not queued`);
  }

  return {
    async insert({ userId, recipientPhone, template, payload }) {
      const { id } = await db
        .insertInto('notifications')
        .values({
          user_id: userId,
          recipient_phone: recipientPhone,
          channel: 'sms',
          template,
          payload: JSON.stringify(payload),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return id;
    },

    markSent: (id, providerMessageId) => mark(id, { status: 'sent', providerMessageId }),
    markRetry: (id, error) => mark(id, { status: 'queued', error }),
    markFailed: (id, error) => mark(id, { status: 'failed', error }),

    async claimDue(limit) {
      // Locking with skip locked keeps two workers off the same rows, and bumping updated_at
      // (which every retry delay counts from) keeps the rows out of later claims while they are
      // sent, after this statement has committed.
      const rows = await db
        .updateTable('notifications')
        .set({ updated_at: sql<Date>`now()` })
        .where('id', 'in', (eb) =>
          eb
            .selectFrom('notifications')
            .select('id')
            .where('status', '=', 'queued')
            .where((due) =>
              due.or(
                RETRY_DELAYS_MS.map((delayMs, attempts) =>
                  due.and([
                    due('attempts', '=', attempts),
                    due(
                      'updated_at',
                      '<=',
                      sql<Date>`now() - make_interval(secs => ${delayMs / 1000})`,
                    ),
                  ]),
                ),
              ),
            )
            .orderBy('created_at')
            .limit(limit)
            .forUpdate()
            .skipLocked(),
        )
        .returning(['id', 'recipient_phone', 'template', 'payload', 'attempts', 'created_at'])
        .execute();
      return rows
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
        .map((row) => ({
          id: row.id,
          recipientPhone: row.recipient_phone,
          template: row.template,
          payload: row.payload,
          attempts: row.attempts,
        }));
    },
  };
}
