// The queue worker is meant to run every minute (#30). Four attempts spread over about 20 minutes
// ride out a short Termii or network outage without hammering it, and leave an admin most of the
// provider response window (provider_response_minutes) to act on the alert.
export const MAX_SEND_ATTEMPTS = 4;

/**
 * How long a queued message waits after its last attempt before the queue sends it again, indexed
 * by attempts so far. A message with no attempt is normally still being sent inline, so the queue
 * leaves it a minute, far longer than the Termii timeout, before treating that send as lost.
 */
export const RETRY_DELAYS_MS = [60_000, 60_000, 5 * 60_000, 15 * 60_000] as const;

export const QUEUE_BATCH_SIZE = 50;
