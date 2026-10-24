import { Router } from 'express';
import { version } from '../version.js';

export function apiRoutes(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', version });
  });
  return router;
}
