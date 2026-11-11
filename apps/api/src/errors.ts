import type { ErrorCode, ErrorResponse, ValidationIssue } from '@coldlink/shared';

const statusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 400,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  internal: 500,
  unauthorized: 401,
  forbidden: 403,
  otp_invalid: 400,
  consent_required: 400,
  account_disabled: 403,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = statusByCode[code];
  }

  toResponse(): ErrorResponse {
    const { code, message, details } = this;
    return { error: details === undefined ? { code, message } : { code, message, details } };
  }
}

/** A 400 for one body field that passed the schema but fails a check against stored data. */
export function invalidBody(path: string, message: string): AppError {
  const issue: ValidationIssue = { location: 'body', path, message };
  return new AppError('validation_failed', 'Some fields are missing or invalid', [issue]);
}
