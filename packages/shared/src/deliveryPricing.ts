import * as z from 'zod';
import { todayInLagos } from './dates.js';
import {
  capacityUnits,
  vehicleTypeSchema,
  type BookingStatus,
  type CapacityUnit,
  type VehicleType,
} from './enums.js';

// Distance, vehicle, fee and scheduling window of a delivery (PRD 7.7). The rounding points are
// decision 139; the windows are decision 140.

/** Mean Earth radius, the usual figure for the Haversine formula. */
const EARTH_RADIUS_KM = 6371.0088;
/** `distance_km` is kept to 0.1 km, the precision search shows distances in (decision 73). */
const DISTANCE_SCALE = 10;
const BASIS_POINTS = 10_000;

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** One vehicle band: the vehicle carries loads below `below`, or any load when `below` is null. */
export const vehicleBandSchema = z.strictObject({
  vehicle_type: vehicleTypeSchema,
  below: z.number().positive('Must be greater than 0').nullable(),
});
export type VehicleBand = z.infer<typeof vehicleBandSchema>;

const bandListSchema = z
  .array(vehicleBandSchema)
  .min(1, 'List at least one vehicle')
  .superRefine((bands, ctx) => {
    bands.forEach((band, index) => {
      const last = index === bands.length - 1;
      if (last !== (band.below === null)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'below'],
          message: last ? 'The last band must take any load (null)' : 'Only the last band is open',
        });
      }
      const previous = bands[index - 1]?.below;
      if (band.below !== null && previous != null && band.below <= previous) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'below'],
          message: 'Each band must start above the one before',
        });
      }
    });
    if (new Set(bands.map((band) => band.vehicle_type)).size !== bands.length) {
      ctx.addIssue({ code: 'custom', message: 'List each vehicle once' });
    }
  });

/** The vehicle for a load, by load unit, smallest band first (decision 138). */
export const vehicleBandsSchema = z.strictObject(
  Object.fromEntries(capacityUnits.map((unit) => [unit, bandListSchema])) as Record<
    CapacityUnit,
    typeof bandListSchema
  >,
);
export type VehicleBands = z.infer<typeof vehicleBandsSchema>;

export function vehicleForLoad(
  bands: VehicleBands,
  quantity: number,
  unit: CapacityUnit,
): VehicleType {
  const band = bands[unit].find(({ below }) => below === null || quantity < below);
  // The schema makes the last band open, so a band always matches.
  if (band === undefined) throw new Error(`No vehicle band for ${quantity} ${unit}`);
  return band.vehicle_type;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** The great-circle distance between two points, in km. */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The estimated road distance, Haversine × the road factor, rounded half up to 0.1 km. */
export function roadDistanceKm(from: GeoPoint, to: GeoPoint, roadDistanceFactor: number): number {
  const tenths = Math.round(haversineKm(from, to) * roadDistanceFactor * DISTANCE_SCALE);
  return tenths / DISTANCE_SCALE;
}

export interface DeliveryRates {
  delivery_base_fee_kobo: number;
  delivery_per_km_kobo: number;
  delivery_min_fee_kobo: number;
  delivery_partner_share: number;
}

export interface DeliveryFee {
  fee_kobo: number;
  partner_payout_kobo: number;
  platform_margin_kobo: number;
}

function divideRoundingHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function toSafeNumber(amount: bigint): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${amount} kobo is too large to represent`);
  }
  return Number(amount);
}

/**
 * PRD 7.7: `fee = max(min_fee, base_fee + per_km × km)`, with the per-km part rounded half up to
 * whole kobo; the partner's payout is `fee × share`, rounded half up, and the margin the rest.
 * `distanceKm` is a stored distance, with at most one decimal place.
 */
export function calculateDeliveryFee(distanceKm: number, rates: DeliveryRates): DeliveryFee {
  const tenths = BigInt(Math.round(distanceKm * DISTANCE_SCALE));
  const distancePart = divideRoundingHalfUp(
    tenths * BigInt(rates.delivery_per_km_kobo),
    BigInt(DISTANCE_SCALE),
  );
  const base = BigInt(rates.delivery_base_fee_kobo) + distancePart;
  const minimum = BigInt(rates.delivery_min_fee_kobo);
  const fee = base > minimum ? base : minimum;
  const share = BigInt(Math.round(rates.delivery_partner_share * BASIS_POINTS));
  const payout = divideRoundingHalfUp(fee * share, BigInt(BASIS_POINTS));
  return {
    fee_kobo: toSafeNumber(fee),
    partner_payout_kobo: toSafeNumber(payout),
    platform_margin_kobo: toSafeNumber(fee - payout),
  };
}

export const deliveryDirections = ['inbound', 'outbound'] as const;
export type DeliveryDirection = (typeof deliveryDirections)[number];
export const deliveryDirectionSchema = z.enum(deliveryDirections);

/** Which bookings a delivery can be requested for after booking (decision 141). */
export function acceptsDelivery(direction: DeliveryDirection, status: BookingStatus): boolean {
  return direction === 'inbound'
    ? status === 'confirmed'
    : status === 'confirmed' || status === 'in_storage';
}

/** The days a delivery can be scheduled on, both included, on the Lagos calendar. */
export interface DeliveryWindow {
  earliest_date: string;
  latest_date: string;
}

export interface BookingDates {
  start_date: string;
  end_date: string;
}

/**
 * When a delivery for a booking can be scheduled (PRD 7.7 rules, decision 140): inbound from today
 * to the start date, outbound from today, or the start date if later, to the end date, the day the
 * produce must be collected. Undefined when that window has closed.
 */
export function deliveryWindow(
  direction: DeliveryDirection,
  booking: BookingDates,
  now: Date,
): DeliveryWindow | undefined {
  const today = todayInLagos(now);
  const earliest =
    direction === 'outbound' && booking.start_date > today ? booking.start_date : today;
  const latest = direction === 'inbound' ? booking.start_date : booking.end_date;
  return earliest <= latest ? { earliest_date: earliest, latest_date: latest } : undefined;
}

export function isInWindow(window: DeliveryWindow, date: string): boolean {
  return window.earliest_date <= date && date <= window.latest_date;
}
