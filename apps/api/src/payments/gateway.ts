import type { PaystackChannel } from '@coldlink/shared';

export interface ChargeRequest {
  reference: string;
  amountKobo: number;
  /** Paystack needs an email for every charge; see `customerEmail`. */
  email: string;
  callbackUrl: string;
  channels: readonly PaystackChannel[];
}

export interface InitializedCharge {
  authorizationUrl: string;
  accessCode: string;
}

/** A charge as the gateway reports it, from a webhook event or a verify call. */
export interface GatewayCharge {
  reference: string;
  /** `success` once paid; Paystack also reports `abandoned`, `failed`, `ongoing` and others. */
  status: string;
  amountKobo: number;
  currency: string;
  /** The gateway's own record of the charge, minus anything about the payer (decision 93). */
  record: Record<string, string | number | null>;
}

export interface RefundRequest {
  /** The reference of the charge being refunded. */
  chargeReference: string;
  amountKobo: number;
}

export interface GatewayRefund {
  refundId: string;
  /** Paystack's refund status, such as `pending` or `processed`. */
  status: string;
}

/** A refund the gateway already holds for a charge. */
export interface ExistingRefund extends GatewayRefund {
  amountKobo: number;
}

export interface RefundLookup {
  /** The reference of the charge the refunds are for. */
  chargeReference: string;
  /** The gateway's own id for the charge, from its verify or webhook record, when known. */
  transactionId: string | null;
  /** Refunds created before this are not looked at. */
  since: Date;
}

export interface PaymentGateway {
  /** Starts a charge and returns the checkout page for it. */
  initialize(charge: ChargeRequest): Promise<InitializedCharge>;
  /** Asks the gateway for a charge's current state. */
  verify(reference: string): Promise<GatewayCharge>;
  /** Asks the gateway to refund all or part of a charge. */
  refund(refund: RefundRequest): Promise<GatewayRefund>;
  /** The refunds the gateway holds for a charge, whatever their status. */
  listRefunds(lookup: RefundLookup): Promise<ExistingRefund[]>;
  /** Whether a webhook body really came from the gateway, from its signature header. */
  isSignedWebhook(rawBody: Buffer, signature: string | undefined): boolean;
}

/**
 * A gateway call that failed. The message never holds a key, a payload or a full reference, so it
 * can be stored and logged.
 */
export class PaymentGatewayError extends Error {
  override readonly name = 'PaymentGatewayError';
}

/** Enough of a reference to find it in Paystack's dashboard by its ending, never all of it. */
export function maskReference(reference: string): string {
  const visible = 4;
  if (reference.length <= visible * 2) return '***';
  return `${reference.slice(0, 4)}***${reference.slice(-visible)}`;
}

/**
 * Farmers sign in with a phone number and have no email, which Paystack requires. example.com is
 * reserved (RFC 2606) and publishes a null MX (RFC 7505), so a receipt Paystack sends here reaches
 * nobody; Paystack refuses the `.invalid` domain (decision 96).
 */
export function customerEmail(coldlinkId: string): string {
  return `farmer-${coldlinkId}@example.com`;
}
