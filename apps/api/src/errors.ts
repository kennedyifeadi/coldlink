import type { ErrorCode, ErrorResponse } from '@coldlink/shared';

const statusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 400,
  not_found: 404,
  payload_too_large: 413,
  rate_limited: 429,
  internal: 500,
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
