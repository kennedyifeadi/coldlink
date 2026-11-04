import type { NotificationStatus } from '@coldlink/shared';
import { deliver, giveUp, type NotificationDeps } from './send.js';
import { QUEUE_BATCH_SIZE } from './retryPolicy.js';
import type { QueuedNotification } from './store.js';
import type { TemplateRegistry } from './templates.js';

export type QueueRunSummary = Record<NotificationStatus, number>;

/**
 * Sends again the queued SMS whose retry delay has passed. A template that is not retryable, such
 * as `otp`, whose code was never stored, is marked failed instead (decision 29).
 */
export async function processNotificationQueue<Registry extends TemplateRegistry>(
  deps: NotificationDeps<Registry>,
  limit = QUEUE_BATCH_SIZE,
): Promise<QueueRunSummary> {
  const summary: QueueRunSummary = { queued: 0, sent: 0, failed: 0 };
  for (const notification of await deps.store.claimDue(limit)) {
    summary[await resend(deps, notification)] += 1;
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
  if (!template.retryable) {
    await giveUp(deps, notification, 'Not retryable: the message was never stored');
    return 'failed';
  }
  const prepared = template.params.safeParse(payload);
  if (!prepared.success) {
    await giveUp(deps, notification, 'The stored payload no longer fits the template');
    return 'failed';
  }
  const { text } = template.prepare(prepared.data);
  return deliver(deps, { ...notification, retryable: true, text });
}
