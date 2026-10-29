import * as z from 'zod';

// Values match the PRD 5 data model exactly; database check constraints use the same spellings.

export const userRoles = ['farmer', 'provider', 'delivery_partner', 'admin'] as const;
export type UserRole = (typeof userRoles)[number];
export const userRoleSchema = z.enum(userRoles);

export const bookingStatuses = [
  'payment_pending',
  'pending_provider',
  'confirmed',
  'rejected',
  'expired',
  'in_storage',
  'cancelled',
  'no_show',
  'completed',
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];
export const bookingStatusSchema = z.enum(bookingStatuses);

export const cancelledByValues = ['farmer', 'provider', 'system', 'admin'] as const;
export type CancelledBy = (typeof cancelledByValues)[number];
export const cancelledBySchema = z.enum(cancelledByValues);

export const facilityTypes = [
  'cold_room',
  'chest_freezer',
  'fridge',
  'fridge_fleet',
  'other',
] as const;
export type FacilityType = (typeof facilityTypes)[number];
export const facilityTypeSchema = z.enum(facilityTypes);

export const capacityUnits = ['sqm', 'crates', 'kg'] as const;
export type CapacityUnit = (typeof capacityUnits)[number];
export const capacityUnitSchema = z.enum(capacityUnits);

export const verificationStatuses = ['pending', 'approved', 'suspended', 'rejected'] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];
export const verificationStatusSchema = z.enum(verificationStatuses);

export const backupPowerValues = ['generator', 'solar', 'none', 'unknown'] as const;
export type BackupPower = (typeof backupPowerValues)[number];
export const backupPowerSchema = z.enum(backupPowerValues);

// delivery_fee pays for a delivery requested after booking, in its own transaction (PRD 7.7).
export const paymentPurposes = ['booking_deposit', 'delivery_fee', 'refund'] as const;
export type PaymentPurpose = (typeof paymentPurposes)[number];
export const paymentPurposeSchema = z.enum(paymentPurposes);

export const paymentStatuses = [
  'initiated',
  'success',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export const paymentStatusSchema = z.enum(paymentStatuses);

export const payoutStatuses = ['owed', 'paid'] as const;
export type PayoutStatus = (typeof payoutStatuses)[number];
export const payoutStatusSchema = z.enum(payoutStatuses);

export const deliveryStatuses = [
  'requested',
  'assigned',
  'accepted',
  'picked_up',
  'delivered',
  'cancelled',
  'failed',
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];
export const deliveryStatusSchema = z.enum(deliveryStatuses);

export const vehicleTypes = ['bike', 'tricycle', 'van', 'truck'] as const;
export type VehicleType = (typeof vehicleTypes)[number];
export const vehicleTypeSchema = z.enum(vehicleTypes);

// marketplace_order is reserved for the future marketplace (PRD 5.10); nothing creates it yet.
export const deliveryContextTypes = [
  'booking_inbound',
  'booking_outbound',
  'marketplace_order',
] as const;
export type DeliveryContextType = (typeof deliveryContextTypes)[number];
export const deliveryContextTypeSchema = z.enum(deliveryContextTypes);

export const listingStatuses = ['draft', 'active', 'sold_out', 'expired', 'cancelled'] as const;
export type ListingStatus = (typeof listingStatuses)[number];
export const listingStatusSchema = z.enum(listingStatuses);

// Reserved for the phase-2 marketplace (PRD 15); nothing creates a reservation yet.
// payment_pending: holding quantity until the deposit is paid. confirmed: deposit paid.
// completed: collected at the facility with the pickup code. expired: deposit not paid, or produce
// not collected, in time. cancelled: called off by the buyer, farmer or an admin.
export const listingReservationStatuses = [
  'payment_pending',
  'confirmed',
  'completed',
  'expired',
  'cancelled',
] as const;
export type ListingReservationStatus = (typeof listingReservationStatuses)[number];
export const listingReservationStatusSchema = z.enum(listingReservationStatuses);

export const bookingEventActorTypes = [
  'farmer',
  'provider',
  'delivery_partner',
  'system',
  'admin',
] as const;
export type BookingEventActorType = (typeof bookingEventActorTypes)[number];
export const bookingEventActorTypeSchema = z.enum(bookingEventActorTypes);

// expiry reminders go 2 days before end_date and on the last day; the collection reminder on
// end_date (PRD 7.6). Each is sent at most once per booking.
export const bookingReminderKinds = [
  'expiry_two_days_before',
  'expiry_last_day',
  'collection_due',
] as const;
export type BookingReminderKind = (typeof bookingReminderKinds)[number];
export const bookingReminderKindSchema = z.enum(bookingReminderKinds);

export const notificationChannels = ['sms', 'whatsapp'] as const;
export type NotificationChannel = (typeof notificationChannels)[number];
export const notificationChannelSchema = z.enum(notificationChannels);

// queued: logged and waiting for a first send or a retry. sent: the SMS provider accepted it.
// failed: given up on. No delivered state, since nothing in this build reads delivery reports.
export const notificationStatuses = ['queued', 'sent', 'failed'] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];
export const notificationStatusSchema = z.enum(notificationStatuses);

export const actionTokenPurposes = [
  'provider_accept_booking',
  'provider_reject_booking',
  'delivery_accept',
  'delivery_update',
] as const;
export type ActionTokenPurpose = (typeof actionTokenPurposes)[number];
export const actionTokenPurposeSchema = z.enum(actionTokenPurposes);

export const searchChannels = ['web', 'whatsapp', 'sms'] as const;
export type SearchChannel = (typeof searchChannels)[number];
export const searchChannelSchema = z.enum(searchChannels);
