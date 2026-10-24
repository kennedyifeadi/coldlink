import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors.js';

function hasProperty<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

// express.json() reports problems with the request itself as errors with a `type` and a 4xx
// `status`.
function fromBodyParser(err: unknown): AppError | undefined {
  if (!hasProperty(err, 'type') || !hasProperty(err, 'status')) return undefined;
  if (err.type === 'entity.too.large') {
    return new AppError('payload_too_large', 'The request body is too large');
  }
  if (err.type === 'entity.parse.failed') {
    return new AppError('bad_request', 'The request body is not valid JSON');
  }
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
    return new AppError('bad_request', 'The request body could not be read');
  }
  return undefined;
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError('not_found', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const known = err instanceof AppError ? err : fromBodyParser(err);
  if (known !== undefined) {
    res.status(known.status).json(known.toResponse());
    return;
  }
  req.log.error({ err }, 'Unexpected error');
  const internal = new AppError('internal', 'Something went wrong. Please try again.');
  res.status(internal.status).json(internal.toResponse());
};
