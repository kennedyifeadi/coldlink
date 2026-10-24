import type { RequestHandler } from 'express';
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { AppError } from '../errors.js';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
}

// Counts are kept in memory, per process. Move to a shared store before running more than one
// API instance, or each instance allows the full limit.
export function rateLimit({ windowMs, limit }: RateLimitOptions): RequestHandler {
  return expressRateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError('rate_limited', 'Too many requests. Please wait and try again.'));
    },
  });
}
