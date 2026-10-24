import * as z from 'zod';

// Every API error response has this shape (PRD 8). Auth issues add their own codes.

export const errorCodes = [
  'bad_request',
  'validation_failed',
  'not_found',
  'payload_too_large',
  'rate_limited',
  'internal',
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export const errorCodeSchema = z.enum(errorCodes);

export const validationIssueSchema = z.object({
  location: z.enum(['body', 'query', 'params']),
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
