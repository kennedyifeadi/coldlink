import type { NotificationStatus } from '@coldlink/shared';
import type { Logger } from 'pino';
import { maskPhoneNumbers } from '../redact.js';
import { SmsSendError, type SmsProvider } from '../sms/provider.js';
import { MAX_SEND_ATTEMPTS } from './retryPolicy.js';
import type { NotificationStore } from './store.js';
import type { SmsTemplate, TemplateParams, TemplateRegistry } from './templates.js';

const RECIPIENT_PHONE = /^\+234\d{10}$/;
const MAX_ERROR_LENGTH = 200;

export interface NotificationDeps<Registry extends TemplateRegistry> {
  store: NotificationStore;
  sms: SmsProvider;
  logger: Logger;
  templates: Registry;
}

export interface NotificationRequest<
  Registry extends TemplateRegistry,
  Name extends keyof Registry & string,
> {
  template: Name;
  params: TemplateParams<Registry, Name>;
  /** E.164, `+234` and ten digits, as every phone column stores it. */
  to: string;
  userId?: string | null;
}

export interface NotificationResult {
  id: string;
  status: NotificationStatus;
}

/** A logged notification on its way to the SMS provider. */
export interface Delivery {
  id: string;
  template: string;
  retryable: boolean;
  to: string;
  text: string;
  /** Attempts before this one. */
  attempts: number;
}

/**
 * Logs an SMS to `notifications` and sends it once. A send the provider fails is recorded, queued
 * for a retry or alerted, but never thrown: a failed SMS must not fail the caller's request
 * (PRD 11). It throws only for a caller's mistake (an unknown template, bad params, a malformed
 * number) or a database error.
 */
export async function sendNotification<
  Registry extends TemplateRegistry,
  Name extends keyof Registry & string,
>(
  deps: NotificationDeps<Registry>,
  { template: name, params, to, userId = null }: NotificationRequest<Registry, Name>,
): Promise<NotificationResult> {
  const template: SmsTemplate | undefined = Object.hasOwn(deps.templates, name)
    ? deps.templates[name]
    : undefined;
  if (template === undefined) throw new Error(`Unknown SMS template: ${name}`);
  // The message never echoes the number, which is personal data.
  if (!RECIPIENT_PHONE.test(to)) throw new Error('The recipient must be +234 and ten digits');
  const { text, payload } = template.prepare(params);
  const id = await deps.store.insert({ userId, recipientPhone: to, template: name, payload });
  const status = await deliver(deps, {
    id,
    template: name,
    retryable: template.retryable,
    to,
    text,
    attempts: 0,
  });
  return { id, status };
}

async function trySend(
  sms: SmsProvider,
  { to, text, template }: Delivery,
): Promise<{ providerMessageId: string } | SmsSendError> {
  try {
    return await sms.send({ to, text, template });
  } catch (error) {
    if (error instanceof SmsSendError) return error;
    // Any other error is a provider bug, and its message may quote the text, so it is not kept.
    return new SmsSendError('The SMS provider failed unexpectedly', false);
  }
}

/** Sends one attempt and records the outcome. Never throws for a provider failure. */
export async function deliver<Registry extends TemplateRegistry>(
  deps: NotificationDeps<Registry>,
  delivery: Delivery,
): Promise<NotificationStatus> {
  const outcome = await trySend(deps.sms, delivery);
  if (!(outcome instanceof SmsSendError)) {
    await deps.store.markSent(delivery.id, outcome.providerMessageId);
    return 'sent';
  }
  const attempts = delivery.attempts + 1;
  const error = maskPhoneNumbers(outcome.message).slice(0, MAX_ERROR_LENGTH);
  if (outcome.retryable && delivery.retryable && attempts < MAX_SEND_ATTEMPTS) {
    await deps.store.markRetry(delivery.id, error);
    deps.logger.warn(
      { notificationId: delivery.id, template: delivery.template, attempts, error },
      'SMS send failed, queued for a retry',
    );
    return 'queued';
  }
  await giveUp(deps, delivery, error);
  return 'failed';
}

/** Marks a notification failed and raises the alert an admin acts on. */
export async function giveUp<Registry extends TemplateRegistry>(
  { store, logger }: NotificationDeps<Registry>,
  { id, template, to, attempts }: Pick<Delivery, 'id' | 'template' | 'to' | 'attempts'>,
  error: string,
): Promise<void> {
  await store.markFailed(id, error);
  logger.error(
    {
      notificationId: id,
      template,
      recipient: maskPhoneNumbers(to),
      attempts: attempts + 1,
      error,
    },
    'SMS delivery failed',
  );
}
