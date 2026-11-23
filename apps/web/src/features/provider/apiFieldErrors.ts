import * as z from 'zod';
import { validationIssueSchema } from '@coldlink/shared';
import { isApiError } from '../../api/client';

const validationDetailsSchema = z.array(validationIssueSchema);

/**
 * The API's first message for each body field the screen shows (decision 89), by field; undefined
 * when the error is not a validation failure on any of them.
 */
export const apiFieldErrors = <F extends string>(
  error: unknown,
  isShown: (field: string) => field is F,
): Partial<Record<F, string>> | undefined => {
  if (!isApiError(error, 'validation_failed')) return undefined;
  const issues = validationDetailsSchema.safeParse(error.details).data ?? [];
  const byField: Partial<Record<F, string>> = {};
  for (const { location, path, message } of issues) {
    const field = path.split('.')[0] ?? '';
    if (location === 'body' && isShown(field) && !byField[field]) byField[field] = message;
  }
  return Object.keys(byField).length > 0 ? byField : undefined;
};
