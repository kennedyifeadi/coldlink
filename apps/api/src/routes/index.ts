import { Router } from 'express';
import { createAppConfigReader, type AppConfigReader } from '../appConfig.js';
import type { Database } from '../db/client.js';
import { checkDatabase } from '../db/health.js';
import { version } from '../version.js';
import { referenceDataRoutes } from './referenceData.js';

export interface RouteDependencies {
  db: Database;
  appConfig?: AppConfigReader;
}

export function apiRoutes({
  db,
  appConfig = createAppConfigReader(db),
}: RouteDependencies): Router {
  const router = Router();
  router.get('/health', async (req, res) => {
    const database = await checkDatabase(db, req.log);
    const status = database === 'up' ? 'ok' : 'degraded';
    res.status(database === 'up' ? 200 : 503).json({ status, version, database });
  });
  router.use(referenceDataRoutes({ db, appConfig }));
  return router;
}
