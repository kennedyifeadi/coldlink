import { toPublicConfig, type ValidationIssue } from '@coldlink/shared';
import { Router, type Response } from 'express';
import * as z from 'zod';
import type { AppConfigReader } from '../appConfig.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { listCropCategories, listCrops } from '../referenceData.js';

// Crops and categories change only through a migration or an admin edit, so a few minutes of
// staleness costs nothing and saves the farmer's data on every search form.
const REFERENCE_MAX_AGE_S = 300;
// The API already serves config from a 60-second cache (decision 45); matching it keeps an admin's
// change from taking more than about two minutes to reach a client.
const CONFIG_MAX_AGE_S = 60;

const cropsQuerySchema = z.object({ category: z.string().optional() });

export interface ReferenceDataDependencies {
  db: Database;
  appConfig: AppConfigReader;
}

function cacheFor(res: Response, seconds: number): Response {
  return res.set('Cache-Control', `public, max-age=${seconds}`);
}

async function requireCategory(db: Database, slug: string): Promise<void> {
  const slugs = (await listCropCategories(db)).map((category) => category.slug);
  if (slugs.includes(slug)) return;
  const issue: ValidationIssue = {
    location: 'query',
    path: 'category',
    message: `Unknown crop category. Use one of: ${slugs.join(', ')}`,
  };
  throw new AppError('validation_failed', 'Some fields are missing or invalid', [issue]);
}

export function referenceDataRoutes({ db, appConfig }: ReferenceDataDependencies): Router {
  const router = Router();

  router.get('/crop-categories', async (_req, res) => {
    const data = await listCropCategories(db);
    cacheFor(res, REFERENCE_MAX_AGE_S).json({ data });
  });

  router.get('/crops', validate({ query: cropsQuerySchema }), async (req, res) => {
    const { category } = req.query as z.infer<typeof cropsQuerySchema>;
    if (category !== undefined) await requireCategory(db, category);
    const crops = await listCrops(db);
    const data =
      category === undefined ? crops : crops.filter((crop) => crop.category_slug === category);
    cacheFor(res, REFERENCE_MAX_AGE_S).json({ data });
  });

  router.get('/config/public', async (_req, res) => {
    const config = await appConfig.get();
    cacheFor(res, CONFIG_MAX_AGE_S).json(toPublicConfig(config));
  });

  return router;
}
