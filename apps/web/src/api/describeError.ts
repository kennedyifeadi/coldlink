import type { TFunction } from 'i18next';
import { isApiError } from './client';

export const formatWait = (seconds: number, t: TFunction) =>
  seconds < 60
    ? t('common.wait.seconds', { count: Math.max(seconds, 1) })
    : t('common.wait.minutes', { count: Math.ceil(seconds / 60) });

/** What happened and what to do next, for any error from the API client. Never the raw message. */
export const describeApiError = (error: unknown, t: TFunction): string => {
  if (!isApiError(error)) return t('common.apiErrors.unexpected');
  switch (error.code) {
    case 'network':
      return t('common.apiErrors.network');
    case 'otp_invalid':
      return t('common.apiErrors.otpInvalid');
    case 'rate_limited':
      return error.retryAfterSeconds === undefined
        ? t('common.apiErrors.rateLimited')
        : t('common.apiErrors.rateLimitedWait', { wait: formatWait(error.retryAfterSeconds, t) });
    case 'consent_required':
      return t('common.apiErrors.consentRequired');
    case 'account_disabled':
      return t('common.apiErrors.accountDisabled');
    case 'unauthorized':
      return t('common.apiErrors.sessionEnded');
    default:
      return t('common.apiErrors.unexpected');
  }
};
