import { randomInt } from 'node:crypto';
import {
  addDays,
  calculatePricing,
  type CapacityUnit,
  type FacilityType,
  type VerificationStatus,
} from '@coldlink/shared';
import { sql } from 'kysely';
import { generateBookingCode } from '../bookings/code.js';
import type { Database } from '../db/client.js';

// Fixtures for the search tests and benchmark. Their phones use +234 800 6, the toll-free range, so
// no SMS could reach a real person, clear of the dev seed (+234 800 0) and the other fixtures.

// A degree of latitude, or of longitude on the equator, near where these fixtures sit.
const KM_PER_DEGREE = 110.574;

export interface Point {
  lat: number;
  lng: number;
}

/** A point about `km` due north of `origin` (south when negative). */
export function northOf(origin: Point, km: number): Point {
  return { lat: origin.lat + km / KM_PER_DEGREE, lng: origin.lng };
}

/** A point about `km` due east of `origin` (west when negative). */
export function eastOf(origin: Point, km: number): Point {
  const kmPerDegree = KM_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180);
  return { lat: origin.lat, lng: origin.lng + km / kmPerDegree };
}

function testPhone(): string {
  return `+2348006${randomInt(100_000, 1_000_000)}`;
}

export async function insertTestUser(db: Database, role: 'farmer' | 'provider'): Promise<string> {
  const { id } = await db
    .insertInto('users')
    .values({
      phone: testPhone(),
      coldlink_id: `${randomInt(1_000_000, 10_000_000)}`,
      roles: [role],
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return id;
}

export async function categoryIdsBySlug(db: Database): Promise<Map<string, string>> {
  const rows = await db.selectFrom('crop_categories').select(['id', 'slug']).execute();
  return new Map(rows.map((row) => [row.slug, row.id]));
}

export async function cropIdByName(db: Database, name: string): Promise<string> {
  const { id } = await db
    .selectFrom('crops')
    .select('id')
    .where('name', '=', name)
    .executeTakeFirstOrThrow();
  return id;
}

export interface SearchProviderFixture {
  ownerId: string;
  location: Point;
  categoryIds: string[];
  displayName?: string;
  facilityType?: FacilityType;
  capacityTotal?: number;
  capacityUnit?: CapacityUnit;
  pricePerUnitPerDayKobo?: number;
  verificationStatus?: VerificationStatus;
  isAcceptingBookings?: boolean;
  avgRating?: number;
}

export async function insertSearchProvider(
  db: Database,
  fixture: SearchProviderFixture,
): Promise<string> {
  const { id } = await db
    .insertInto('providers')
    .values({
      owner_user_id: fixture.ownerId,
      display_name: fixture.displayName ?? 'Search test cold room',
      facility_type: fixture.facilityType ?? 'cold_room',
      phone: testPhone(),
      address_text: 'Test address',
      location: sql<string>`extensions.st_setsrid(extensions.st_makepoint(${fixture.location.lng}, ${fixture.location.lat}), 4326)::extensions.geography`,
      capacity_total: fixture.capacityTotal ?? 100,
      capacity_unit: fixture.capacityUnit ?? 'crates',
      price_per_unit_per_day_kobo: fixture.pricePerUnitPerDayKobo ?? 50_000,
      verification_status: fixture.verificationStatus ?? 'approved',
      is_accepting_bookings: fixture.isAcceptingBookings ?? true,
      avg_rating: fixture.avgRating ?? 0,
      rating_count: fixture.avgRating === undefined ? 0 : 1,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('provider_crop_support')
    .values(fixture.categoryIds.map((category_id) => ({ provider_id: id, category_id })))
    .execute();
  return id;
}

export interface OccupancyFixture {
  providerId: string;
  farmerId: string;
  cropId: string;
  quantity: number;
  capacityUnit?: CapacityUnit;
  startDate: string;
  days: number;
}

/** A confirmed booking holding `quantity` from `startDate` for `days`, priced as the API would. */
export async function insertOccupancy(db: Database, fixture: OccupancyFixture): Promise<void> {
  const terms = {
    quantity: fixture.quantity,
    duration_days: fixture.days,
    unit_price_kobo: 50_000,
    commission_rate: 0.075,
    deposit_percent: 0.3,
    service_fee_kobo: 0,
  };
  const pricing = calculatePricing(terms);
  await db
    .insertInto('bookings')
    .values({
      code: generateBookingCode(),
      farmer_id: fixture.farmerId,
      provider_id: fixture.providerId,
      crop_id: fixture.cropId,
      quantity: fixture.quantity,
      capacity_unit: fixture.capacityUnit ?? 'crates',
      start_date: fixture.startDate,
      duration_days: fixture.days,
      end_date: addDays(fixture.startDate, fixture.days),
      status: 'confirmed',
      unit_price_kobo: terms.unit_price_kobo,
      storage_subtotal_kobo: pricing.storage_subtotal_kobo,
      commission_rate: terms.commission_rate,
      commission_kobo: pricing.commission_kobo,
      service_fee_kobo: pricing.service_fee_kobo,
      deposit_percent: terms.deposit_percent,
      deposit_kobo: pricing.deposit_kobo,
      balance_due_kobo: pricing.balance_due_kobo,
      total_charged_online_kobo: pricing.total_charged_online_kobo,
    })
    .execute();
}

export async function setConfig(db: Database, key: string, value: unknown): Promise<void> {
  await db
    .updateTable('app_config')
    .set({ value: sql`${JSON.stringify(value)}::jsonb` })
    .where('key', '=', key)
    .execute();
}
