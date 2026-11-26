import {
  calculateDeliveryFee,
  deliveryWindow,
  isInWindow,
  roadDistanceKm,
  vehicleForLoad,
  type AppConfig,
  type BookingDates,
  type DeliveryDirection,
  type DeliveryFee,
  type DeliveryLoad,
  type DeliveryQuote,
  type DeliveryWindow,
  type GeoPoint,
  type VehicleType,
} from '@coldlink/shared';
import { AppError, invalidBody } from '../errors.js';

export interface DeliveryPrice extends DeliveryFee {
  distance_km: number;
  vehicle_type: VehicleType;
}

/**
 * The fee for carrying a load between the farmer's point and the facility (PRD 7.7 step 2): the
 * road distance either way is the same, so the direction does not change the price.
 */
export function priceDelivery(
  load: DeliveryLoad,
  facility: GeoPoint,
  config: AppConfig,
): DeliveryPrice {
  const distanceKm = roadDistanceKm(load.location, facility, config.road_distance_factor);
  return {
    distance_km: distanceKm,
    vehicle_type: vehicleForLoad(config.delivery_vehicle_bands, load.load_quantity, load.load_unit),
    ...calculateDeliveryFee(distanceKm, config),
  };
}

/** The window for a delivery, or a 409 once it has closed. */
export function openWindow(
  direction: DeliveryDirection,
  booking: BookingDates & { id?: string },
  now: Date,
): DeliveryWindow {
  const window = deliveryWindow(direction, booking, now);
  if (window === undefined) {
    throw new AppError('conflict', `The time to schedule an ${direction} delivery has passed`, {
      ...(booking.id === undefined ? {} : { booking_id: booking.id }),
      direction,
    });
  }
  return window;
}

/** A 400 on `path` unless `date` is inside the window (decision 140). */
export function checkScheduledFor(window: DeliveryWindow, date: string, path: string): void {
  if (!isInWindow(window, date)) {
    throw invalidBody(path, `Choose a day from ${window.earliest_date} to ${window.latest_date}`);
  }
}

export function toDeliveryQuote(
  direction: DeliveryDirection,
  price: DeliveryPrice,
  window: DeliveryWindow,
): DeliveryQuote {
  return {
    direction,
    distance_km: price.distance_km,
    vehicle_type: price.vehicle_type,
    fee_kobo: price.fee_kobo,
    ...window,
  };
}
