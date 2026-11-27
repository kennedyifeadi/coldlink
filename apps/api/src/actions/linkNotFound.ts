import { AppError } from '../errors.js';

/**
 * One answer for every link that cannot be used (unknown, used, expired, revoked, malformed, or
 * for another step), so they cannot be told apart.
 */
export function linkNotFound(): AppError {
  return new AppError('not_found', 'This link has expired or has already been used');
}
