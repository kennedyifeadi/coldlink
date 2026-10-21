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

export const paymentPurposes = ['booking_deposit', 'refund'] as const;
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
