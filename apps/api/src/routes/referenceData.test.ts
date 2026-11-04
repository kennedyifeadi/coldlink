import {
  cropCategoriesResponseSchema,
  cropsResponseSchema,
  errorResponseSchema,
  validationIssueSchema,
} from '@coldlink/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { stubDatabase, testApp } from '../test/helpers.js';

const categories = {
  vegetables: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'vegetables',
    name: 'Vegetables',
  },
  other: { id: '00000000-0000-4000-8000-000000000002', slug: 'other', name: 'Other' },
  dairy: { id: '00000000-0000-4000-8000-000000000003', slug: 'dairy', name: 'Dairy' },
  tubers: { id: '00000000-0000-4000-8000-000000000004', slug: 'tubers', name: 'Tubers' },
};

function cropRow(
  id: number,
  name: string,
  category: (typeof categories)[keyof typeof categories],
  localNames: string[] = [],
) {
  return {
    id: `00000000-0000-4000-9000-${String(id).padStart(12, '0')}`,
    name,
    local_names: localNames,
    category_id: category.id,
    category_slug: category.slug,
    category_name: category.name,
  };
}

// Deliberately out of order: the API sorts, whatever order the database returns.
const cropRows = [
  cropRow(1, 'Other vegetables', categories.vegetables),
  cropRow(2, 'Yam', categories.tubers, ['isu']),
  cropRow(3, 'Other produce', categories.other),
  cropRow(4, 'Tomatoes', categories.vegetables),
  cropRow(5, 'Okra', categories.vegetables, ['ila']),
  cropRow(6, 'Other dairy', categories.dairy),
  cropRow(7, 'Cassava', categories.tubers, ['ege', 'gbaguda']),
  cropRow(8, 'Onions', categories.vegetables, ['alubosa']),
];

function app() {
  const db = stubDatabase({ crop_categories: Object.values(categories), crops: cropRows });
  return testApp(undefined, db).app;
}

describe('GET /api/v1/crop-categories', () => {
  it('lists every category alphabetically, with "Other" last', async () => {
    const response = await request(app()).get('/api/v1/crop-categories');
    expect(response.status).toBe(200);
    expect(cropCategoriesResponseSchema.parse(response.body)).toEqual({
      data: [categories.dairy, categories.tubers, categories.vegetables, categories.other],
    });
  });

  it('is cacheable by clients for 5 minutes', async () => {
    const response = await request(app()).get('/api/v1/crop-categories');
    expect(response.headers['cache-control']).toBe('public, max-age=300');
  });

  it('returns an empty list when there are no categories', async () => {
    const response = await request(testApp().app).get('/api/v1/crop-categories');
    expect(response.body).toEqual({ data: [] });
  });
});

describe('GET /api/v1/crops', () => {
  it('lists every crop by category, then name, with the generic crop last in its category', async () => {
    const response = await request(app()).get('/api/v1/crops');
    expect(response.status).toBe(200);
    const { data } = cropsResponseSchema.parse(response.body);
    expect(data.map((crop) => `${crop.category_slug}/${crop.name}`)).toEqual([
      'dairy/Other dairy',
      'tubers/Cassava',
      'tubers/Yam',
      'vegetables/Okra',
      'vegetables/Onions',
      'vegetables/Tomatoes',
      'vegetables/Other vegetables',
      'other/Other produce',
    ]);
  });

  it('returns each crop with its local names and category, and nothing else', async () => {
    const response = await request(app()).get('/api/v1/crops');
    const { data } = cropsResponseSchema.parse(response.body);
    expect(data.find((crop) => crop.name === 'Cassava')).toEqual({
      id: '00000000-0000-4000-9000-000000000007',
      name: 'Cassava',
      local_names: ['ege', 'gbaguda'],
      category_id: categories.tubers.id,
      category_slug: 'tubers',
    });
  });

  it('filters by category slug', async () => {
    const response = await request(app()).get('/api/v1/crops?category=tubers');
    expect(response.status).toBe(200);
    const { data } = cropsResponseSchema.parse(response.body);
    expect(data.map((crop) => crop.name)).toEqual(['Cassava', 'Yam']);
  });

  it('is cacheable by clients for 5 minutes, filtered or not', async () => {
    for (const path of ['/api/v1/crops', '/api/v1/crops?category=dairy']) {
      const response = await request(app()).get(path);
      expect(response.headers['cache-control']).toBe('public, max-age=300');
    }
  });

  it('returns 400 validation_failed, not an empty list, for an unknown category', async () => {
    const response = await request(app()).get('/api/v1/crops?category=grains');
    expect(response.status).toBe(400);
    const { error } = errorResponseSchema.parse(response.body);
    expect(error.code).toBe('validation_failed');
    expect(z.array(validationIssueSchema).parse(error.details)).toEqual([
      {
        location: 'query',
        path: 'category',
        message: 'Unknown crop category. Use one of: dairy, tubers, vegetables, other',
      },
    ]);
    expect(response.headers['cache-control']).toBeUndefined();
  });

  it.each([
    ['an empty category', '?category='],
    ['a category given twice', '?category=dairy&category=tubers'],
  ])('returns 400 validation_failed for %s', async (_case, query) => {
    const response = await request(app()).get(`/api/v1/crops${query}`);
    expect(response.status).toBe(400);
    const { error } = errorResponseSchema.parse(response.body);
    expect(error.code).toBe('validation_failed');
    expect(z.array(validationIssueSchema).parse(error.details)).toEqual([
      expect.objectContaining({ location: 'query', path: 'category' }),
    ]);
  });
});
