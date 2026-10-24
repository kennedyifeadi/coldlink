import express, { type Express, type Router } from 'express';
import type { Config } from './config.js';
import { apiRoutes } from './routes/index.js';

export const API_BASE_PATH = '/api/v1';

export interface AppOptions {
  routes?: Router;
}

export function createApp(_config: Config, { routes = apiRoutes() }: AppOptions = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(API_BASE_PATH, routes);
  return app;
}
