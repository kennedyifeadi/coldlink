import * as z from 'zod';
import { bookingStatusSchema, paymentStatusSchema } from './enums.js';

// Request and response bodies of the payment endpoints (PRD 7.5).

/** Every channel Paystack's checkout can offer, spelt as its Initialize Transaction API takes them. */
export const paystackChannels = [
  'card',
  'bank',
  'apple_pay',
  'ussd',
  'qr',
  'mobile_money',
  'bank_transfer',
  'eft',
  'capitec_pay',
  'payattitude',
] as const;
export type PaystackChannel = (typeof paystackChannels)[number];
export const paystackChannelSchema = z.enum(paystackChannels);

/** A charge's reference, which ColdLink makes and Paystack stores. */
export const paymentReferenceSchema = z.string().regex(/^CLP-[0-9a-f]{20}$/);

/** Pays a booking awaiting payment, or a delivery requested after booking (decision 143). */
export const initializePaymentBodySchema = z.union([
  z.strictObject({ booking_id: z.uuid() }),
  z.strictObject({ delivery_request_id: z.uuid() }),
]);
export type InitializePaymentBody = z.input<typeof initializePaymentBodySchema>;

export const initializedPaymentSchema = z.strictObject({
  /** Paystack's checkout page for this charge. */
  authorization_url: z.url({ protocol: /^https$/ }),
  reference: paymentReferenceSchema,
});
export type InitializedPayment = z.infer<typeof initializedPaymentSchema>;

export const paymentVerificationSchema = z.strictObject({
  reference: paymentReferenceSchema,
  /** `refunded` when the payment came too late for the booking to keep its space. */
  payment_status: paymentStatusSchema,
  booking_id: z.uuid(),
  booking_status: bookingStatusSchema,
  /** The delivery a delivery charge pays for; null for a booking's own charge. */
  delivery_request_id: z.uuid().nullable(),
});
export type PaymentVerification = z.infer<typeof paymentVerificationSchema>;
