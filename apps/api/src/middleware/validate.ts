import type { ValidationIssue } from '@coldlink/shared';
import type { RequestHandler } from 'express';
import type * as z from 'zod';
import { AppError } from '../errors.js';

type Location = ValidationIssue['location'];
type RequestSchemas = Partial<Record<Location, z.ZodType>>;

const locations: Location[] = ['params', 'query', 'body'];

/** Validates req.params, req.query and req.body, and replaces each with its parsed value. */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];
    for (const location of locations) {
      const schema = schemas[location];
      if (schema === undefined) continue;
      const result = schema.safeParse(req[location]);
      if (result.success) {
        // Express 5 exposes req.query through a getter, so it cannot be assigned.
        Object.defineProperty(req, location, { value: result.data, writable: true });
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({
            location,
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        );
      }
    }
    if (issues.length > 0) {
      next(new AppError('validation_failed', 'Some fields are missing or invalid', issues));
      return;
    }
    next();
  };
}
