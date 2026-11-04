import { Router } from 'express';
import type { Database } from '../db/client.js';
import { checkDatabase } from '../db/health.js';
import { version } from '../version.js';

export interface RouteDependencies {
  db: Database;
}

export function apiRoutes({ db }: RouteDependencies): Router {
  const router = Router();
  router.get('/health', async (req, res) => {
    const database = await checkDatabase(db, req.log);
    const status = database === 'up' ? 'ok' : 'degraded';
    res.status(database === 'up' ? 200 : 503).json({ status, version, database });
  });
  return router;
}
