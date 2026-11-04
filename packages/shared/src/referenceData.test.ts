import { describe, expect, it } from 'vitest';
import { cropCategoriesResponseSchema, cropsResponseSchema } from './referenceData.js';

const vegetables = {
  id: '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f',
  slug: 'vegetables',
  name: 'Vegetables',
};
const okra = {
  id: '5e2a7c1d-9b3f-4e6a-8d0c-1f2e3a4b5c6d',
  name: 'Okra',
  local_names: ['ila'],
  category_id: vegetables.id,
  category_slug: 'vegetables',
};

describe('cropCategoriesResponseSchema', () => {
  it('accepts a list of categories', () => {
    expect(cropCategoriesResponseSchema.parse({ data: [vegetables] })).toEqual({
      data: [vegetables],
    });
  });

  it.each([
    ['an unexpected field', { ...vegetables, created_at: '2026-11-04' }],
    ['a slug with capitals', { ...vegetables, slug: 'Vegetables' }],
    ['an id that is not a uuid', { ...vegetables, id: '1' }],
  ])('rejects %s', (_name, category) => {
    expect(cropCategoriesResponseSchema.safeParse({ data: [category] }).success).toBe(false);
  });
});

describe('cropsResponseSchema', () => {
  it('accepts a list of crops', () => {
    expect(cropsResponseSchema.parse({ data: [okra] })).toEqual({ data: [okra] });
  });

  it.each([
    ['an unexpected field', { ...okra, shelf_life_days_ambient: null }],
    ['no category slug', { ...okra, category_slug: undefined }],
    ['local names that are not a list', { ...okra, local_names: 'ila' }],
  ])('rejects %s', (_name, crop) => {
    expect(cropsResponseSchema.safeParse({ data: [crop] }).success).toBe(false);
  });
});
