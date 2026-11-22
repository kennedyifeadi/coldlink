import type { NotificationStatus } from '@coldlink/shared';
import { deliver, giveUp, type NotificationDeps } from './send.js';
import { QUEUE_BATCH_SIZE } from './retryPolicy.js';
import type { QueuedNotification } from './store.js';
import type { TemplateRegistry } from './templates.js';

export type QueueRunSummary = Record<NotificationStatus, number>;

/**
 * Sends again the queued SMS whose retry delay has passed, rendered again by its template. A
 * message the template refuses, such as an `otp`, whose code was never stored (decision 29), or a
 * link for a booking that is no longer waiting, is marked failed instead. One that throws, as a
 * link that could not be issued does, stays queued and does not hold up the others. Once `signal` aborts
 * the rest are left queued for a later run.
 */
export async function processNotificationQueue<Registry extends TemplateRegistry>(
  deps: NotificationDeps<Registry>,
  limit = QUEUE_BATCH_SIZE,
  signal?: AbortSignal,
): Promise<QueueRunSummary> {
  const summary: QueueRunSummary = { queued: 0, sent: 0, failed: 0 };
  for (const notification of await deps.store.claimDue(limit)) {
    if (signal?.aborted) break;
    try {
      summary[await resend(deps, notification)] += 1;
    } catch (err) {
      summary.queued += 1;
      deps.logger.error(
        { err, notificationId: notification.id, template: notification.template },
        'Queued SMS could not be resent',
      );
    }
  }
  return summary;
}

async function resend<Registry extends TemplateRegistry>(
  deps: NotificationDeps<Registry>,
  { id, template: name, recipientPhone: to, payload, attempts }: QueuedNotification,
): Promise<NotificationStatus> {
  const template = Object.hasOwn(deps.templates, name) ? deps.templates[name] : undefined;
  const notification = { id, template: name, to, attempts };
  if (template === undefined) {
    await giveUp(deps, notification, 'Unknown template');
    return 'failed';
  }
  const rerendered = await template.rerender(payload);
  if ('refused' in rerendered) {
    await giveUp(deps, notification, rerendered.refused);
    return 'failed';
  }
  return deliver(deps, { ...notification, retryable: template.retryable, text: rerendered.text });
}
