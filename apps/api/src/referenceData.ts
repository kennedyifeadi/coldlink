import type { Crop, CropCategory } from '@coldlink/shared';
import type { Database } from './db/client.js';

const OTHER_CATEGORY_SLUG = 'other';
const GENERIC_CROP_PREFIX = 'Other ';

type Named = Pick<CropCategory, 'name'>;
type CategoryKey = Pick<CropCategory, 'slug' | 'name'>;

function byName(a: Named, b: Named): number {
  return a.name.localeCompare(b.name, 'en');
}

// Alphabetical, with the catch-all category last, so a picker reads A to Z and ends with "Other".
function byCategory(a: CategoryKey, b: CategoryKey): number {
  const otherLast = Number(a.slug === OTHER_CATEGORY_SLUG) - Number(b.slug === OTHER_CATEGORY_SLUG);
  return otherLast || byName(a, b) || a.slug.localeCompare(b.slug, 'en');
}

// Each category's generic "Other ..." crop (decision 40) follows its named crops.
function genericLast(a: Named, b: Named): number {
  const isGeneric = (crop: Named) => Number(crop.name.startsWith(GENERIC_CROP_PREFIX));
  return isGeneric(a) - isGeneric(b);
}

export async function listCropCategories(db: Database): Promise<CropCategory[]> {
  const categories = await db
    .selectFrom('crop_categories')
    .select(['id', 'slug', 'name'])
    .execute();
  return categories.toSorted(byCategory);
}

export async function listCrops(db: Database): Promise<Crop[]> {
  const rows = await db
    .selectFrom('crops')
    .innerJoin('crop_categories', 'crop_categories.id', 'crops.category_id')
    .select([
      'crops.id',
      'crops.name',
      'crops.local_names',
      'crops.category_id',
      'crop_categories.slug as category_slug',
      'crop_categories.name as category_name',
    ])
    .execute();
  return rows
    .toSorted(
      (a, b) =>
        byCategory(
          { slug: a.category_slug, name: a.category_name },
          { slug: b.category_slug, name: b.category_name },
        ) ||
        genericLast(a, b) ||
        byName(a, b),
    )
    .map(({ id, name, local_names, category_id, category_slug }) => ({
      id,
      name,
      local_names,
      category_id,
      category_slug,
    }));
}
