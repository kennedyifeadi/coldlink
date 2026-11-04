import {
  cropCategoriesResponseSchema,
  cropsResponseSchema,
  errorResponseSchema,
  publicConfigSchema,
} from '@coldlink/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testApp } from '../test/helpers.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';

// These run against the reference data the seed_reference_data migration put in (decision 40).
describe.skipIf(noTestDatabase)('reference data endpoints against Postgres', () => {
  const db = useTestTransaction();

  it('lists the 7 seeded categories, alphabetically with "Other" last', async () => {
    const response = await request(testApp(undefined, db()).app).get('/api/v1/crop-categories');
    expect(response.status).toBe(200);
    const { data } = cropCategoriesResponseSchema.parse(response.body);
    expect(data.map((category) => category.slug)).toEqual([
      'dairy',
      'fish',
      'fruits',
      'meat_poultry',
      'tubers',
      'vegetables',
      'other',
    ]);
  });

  it('lists the 22 seeded crops by category, with the generic crops last', async () => {
    const response = await request(testApp(undefined, db()).app).get('/api/v1/crops');
    expect(response.status).toBe(200);
    const { data } = cropsResponseSchema.parse(response.body);
    expect(data.map((crop) => `${crop.category_slug}/${crop.name}`)).toEqual([
      'dairy/Other dairy',
      'fish/Fresh fish',
      'fish/Other fish',
      'fruits/Oranges',
      'fruits/Pineapples',
      'fruits/Plantains',
      'fruits/Watermelon',
      'fruits/Other fruits',
      'meat_poultry/Chicken',
      'meat_poultry/Other meat and poultry',
      'tubers/Cassava',
      'tubers/Yam',
      'tubers/Other tubers',
      'vegetables/Cabbage',
      'vegetables/Carrots',
      'vegetables/Leafy vegetables',
      'vegetables/Okra',
      'vegetables/Onions',
      'vegetables/Peppers',
      'vegetables/Tomatoes',
      'vegetables/Other vegetables',
      'other/Other produce',
    ]);
    expect(data.find((crop) => crop.name === 'Onions')?.local_names).toEqual(['alubosa']);
  });

  it('links each crop to its category', async () => {
    const { app } = testApp(undefined, db());
    const categories = cropCategoriesResponseSchema.parse(
      (await request(app).get('/api/v1/crop-categories')).body,
    ).data;
    const crops = cropsResponseSchema.parse((await request(app).get('/api/v1/crops')).body).data;
    const slugById = new Map(categories.map((category) => [category.id, category.slug]));
    for (const crop of crops) {
      expect(slugById.get(crop.category_id)).toBe(crop.category_slug);
    }
  });

  it('filters crops by category', async () => {
    const response = await request(testApp(undefined, db()).app).get(
      '/api/v1/crops?category=tubers',
    );
    expect(response.status).toBe(200);
    const { data } = cropsResponseSchema.parse(response.body);
    expect(data.map((crop) => crop.name)).toEqual(['Cassava', 'Yam', 'Other tubers']);
  });

  it('returns 400 validation_failed for an unknown category', async () => {
    const response = await request(testApp(undefined, db()).app).get(
      '/api/v1/crops?category=grains',
    );
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('validation_failed');
  });

  it('returns the seeded public config values', async () => {
    const response = await request(testApp(undefined, db()).app).get('/api/v1/config/public');
    expect(response.status).toBe(200);
    expect(publicConfigSchema.parse(response.body)).toEqual({
      search_default_radius_km: 25,
      search_max_radius_km: 100,
      service_fee_kobo: 0,
      deposit_percent: 0.3,
      farmer_free_cancel_hours: 24,
    });
  });

  it('does not return a key added to app_config after the allowlist was written', async () => {
    await db()
      .insertInto('app_config')
      .values({ key: 'new_internal_key', value: JSON.stringify('secret') })
      .execute();
    const response = await request(testApp(undefined, db()).app).get('/api/v1/config/public');
    expect(response.status).toBe(200);
    expect(publicConfigSchema.parse(response.body)).not.toHaveProperty('new_internal_key');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
