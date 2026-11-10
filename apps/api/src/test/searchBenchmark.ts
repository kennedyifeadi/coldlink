// Times POST /search with 500 providers (PRD 7.3, 11: p95 under 500 ms) and exits 1 if p95 misses.
// Run through `pnpm --filter @coldlink/api bench:search`. It seeds TEST_DATABASE_URL only, which
// must be a throwaway database on localhost (decision 47), never dev, commits the rows so the
// server's own connections see them, and deletes them again whether or not the run passes.
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import { searchResponseSchema, type CapacityUnit } from '@coldlink/shared';
import { sql } from 'kysely';
import { createApp } from '../app.js';
import { createDatabase, type Database } from '../db/client.js';
import { apiRoutes } from '../routes/index.js';
import { captureLogs, testConfig } from './helpers.js';
import {
  categoryIdsBySlug,
  eastOf,
  insertOccupancy,
  insertSearchProvider,
  insertTestUser,
  northOf,
  type Point,
} from './search.js';
import { fakePhotoStorage } from './storage.js';
import { requireTestDatabaseUrl } from './testDatabase.js';

const PROVIDERS = 500;
const BOOKINGS_PER_PROVIDER = 3;
const WARM_UP_REQUESTS = 20;
const MEASURED_REQUESTS = 300;
const P95_TARGET_MS = 500;
// Every provider is within the default radius of the centre, so a search there runs the
// availability check for every one that passes the cheap filters: the worst case for 500.
const SPREAD_KM = 20;
// A fifth of the searches start this far away, find nothing within the default radius and are
// retried at the maximum, which takes in all 500: two queries in one request.
const EXPANDED_ORIGIN_KM = 50;
const CENTRE: Point = { lat: -1, lng: -1 };
const START_DATE = '2027-01-04';
const NAME = 'Search benchmark provider';

// A fixed seed, so every run measures the same providers and searches.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const next = random(23);
const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
const between = (min: number, max: number) => min + next() * (max - min);

function scatter(centre: Point, km: number): Point {
  return eastOf(northOf(centre, between(-km, km)), between(-km, km));
}

interface Seeded {
  ownerId: string;
  farmerId: string;
  cropIds: string[];
}

async function seed(db: Database): Promise<Seeded> {
  return db.transaction().execute(async (trx) => {
    const ownerId = await insertTestUser(trx, 'provider');
    const farmerId = await insertTestUser(trx, 'farmer');
    const categoryIds = [...(await categoryIdsBySlug(trx)).values()];
    const crops = await trx.selectFrom('crops').select('id').execute();
    const units: CapacityUnit[] = ['crates', 'crates', 'crates', 'kg', 'sqm'];
    for (let index = 0; index < PROVIDERS; index += 1) {
      const capacityUnit = pick(units);
      const capacityTotal = Math.round(between(50, 500));
      const providerId = await insertSearchProvider(trx, {
        ownerId,
        displayName: `${NAME} ${index + 1}`,
        location: scatter(CENTRE, SPREAD_KM),
        categoryIds: [...new Set([pick(categoryIds), pick(categoryIds), pick(categoryIds)])],
        capacityTotal,
        capacityUnit,
        pricePerUnitPerDayKobo: Math.round(between(20_000, 300_000)),
        verificationStatus: next() < 0.9 ? 'approved' : 'pending',
        isAcceptingBookings: next() < 0.9,
        avgRating: Math.round(between(0, 5) * 100) / 100,
      });
      for (let booking = 0; booking < BOOKINGS_PER_PROVIDER; booking += 1) {
        const day = Math.floor(between(0, 28));
        await insertOccupancy(trx, {
          providerId,
          farmerId,
          cropId: pick(crops).id,
          quantity: Math.max(1, Math.round(capacityTotal * between(0.05, 0.3))),
          capacityUnit,
          startDate: `2027-01-${String(1 + day).padStart(2, '0')}`,
          days: Math.ceil(between(1, 14)),
        });
      }
    }
    return { ownerId, farmerId, cropIds: crops.map((crop) => crop.id) };
  });
}

async function cleanUp(db: Database, seeded: Seeded): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('bookings').where('farmer_id', '=', seeded.farmerId).execute();
    await trx.deleteFrom('providers').where('owner_user_id', '=', seeded.ownerId).execute();
    await trx
      .deleteFrom('search_logs')
      .where('lat', '>=', CENTRE.lat - 2)
      .where('lat', '<=', CENTRE.lat + 2)
      .where('lng', '>=', CENTRE.lng - 2)
      .where('lng', '<=', CENTRE.lng + 2)
      .execute();
    await trx.deleteFrom('users').where('id', 'in', [seeded.ownerId, seeded.farmerId]).execute();
  });
}

function searchBody(cropIds: string[], expanded: boolean) {
  const origin = expanded ? northOf(CENTRE, EXPANDED_ORIGIN_KM) : scatter(CENTRE, SPREAD_KM / 2);
  return {
    ...origin,
    crop_id: pick(cropIds),
    quantity: Math.round(between(5, 60)),
    capacity_unit: pick<CapacityUnit>(['crates', 'crates', 'kg', 'sqm']),
    days: Math.ceil(between(3, 30)),
    start_date: START_DATE,
  };
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? NaN;
}

async function timeSearches(baseUrl: string, cropIds: string[]) {
  const timings: number[] = [];
  const counts: number[] = [];
  for (let index = 0; index < WARM_UP_REQUESTS + MEASURED_REQUESTS; index += 1) {
    const body = searchBody(cropIds, index % 5 === 4);
    const started = performance.now();
    const response = await fetch(`${baseUrl}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = searchResponseSchema.parse(await response.json());
    const elapsed = performance.now() - started;
    if (index >= WARM_UP_REQUESTS) {
      timings.push(elapsed);
      counts.push(parsed.data.length);
    }
  }
  return { timings: timings.toSorted((a, b) => a - b), counts };
}

async function main(): Promise<number> {
  const logs = captureLogs();
  const db = createDatabase(
    { databaseUrl: requireTestDatabaseUrl(), databaseSslRootCert: undefined },
    logs.logger,
  );
  let seeded: Seeded | undefined;
  try {
    console.log(`Seeding ${PROVIDERS} providers and ${PROVIDERS * BOOKINGS_PER_PROVIDER} bookings`);
    seeded = await seed(db);
    // Fresh statistics, as autovacuum would give a long-lived database.
    await sql`analyze public.providers, public.bookings, public.provider_crop_support`.execute(db);
    const routes = apiRoutes({
      db,
      config: testConfig,
      logger: logs.logger,
      storage: fakePhotoStorage().storage,
      searchIpLimit: { windowMs: 60_000, limit: 1_000_000 },
    });
    const server = createApp(testConfig, { db, logger: logs.logger, routes }).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { timings, counts } = await timeSearches(`http://127.0.0.1:${port}`, seeded.cropIds);
      const p95 = percentile(timings, 0.95);
      const mean = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;
      console.log(
        [
          `Searches: ${timings.length} measured after ${WARM_UP_REQUESTS} warm-up, one at a time`,
          `p50 ${percentile(timings, 0.5).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ` +
            `p99 ${percentile(timings, 0.99).toFixed(1)} ms, max ${timings.at(-1)?.toFixed(1)} ms`,
          `Results per search: mean ${mean(counts).toFixed(1)}, max ${Math.max(...counts)}`,
        ].join('\n'),
      );
      if (p95 >= P95_TARGET_MS) {
        console.error(`p95 ${p95.toFixed(1)} ms misses the ${P95_TARGET_MS} ms target`);
        return 1;
      }
      return 0;
    } finally {
      server.close();
    }
  } finally {
    if (seeded !== undefined) await cleanUp(db, seeded);
    await db.destroy();
  }
}

process.exitCode = await main();
