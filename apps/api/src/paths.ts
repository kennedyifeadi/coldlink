export const API_BASE_PATH = '/api/v1';

/** Paystack's webhook, which takes its body raw so the signature can be checked over it. */
export const PAYSTACK_WEBHOOK_PATH = `${API_BASE_PATH}/webhooks/paystack`;
