import * as z from 'zod';

// Response bodies of the reference endpoints (PRD 8). Lists are wrapped in `data`, so pagination can
// add a cursor next to it later without changing the shape.

export const cropCategorySchema = z.strictObject({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
});
export type CropCategory = z.infer<typeof cropCategorySchema>;

export const cropCategoriesResponseSchema = z.strictObject({
  data: z.array(cropCategorySchema),
});
export type CropCategoriesResponse = z.infer<typeof cropCategoriesResponseSchema>;

export const cropSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  local_names: z.array(z.string()),
  category_id: z.uuid(),
  category_slug: cropCategorySchema.shape.slug,
});
export type Crop = z.infer<typeof cropSchema>;

export const cropsResponseSchema = z.strictObject({
  data: z.array(cropSchema),
});
export type CropsResponse = z.infer<typeof cropsResponseSchema>;
