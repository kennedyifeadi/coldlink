import type { AppConfig, VerificationStatus } from '@coldlink/shared';
import type { ProviderRecord } from './store.js';

// Suspended and rejected providers stay hidden even when approval is not required (decision 72).
export function visibleStatuses(config: AppConfig): VerificationStatus[] {
  return config.require_provider_approval ? ['approved'] : ['approved', 'pending'];
}

/** Whether search would show the provider to a farmer, leaving aside crop, unit and capacity. */
export function isBookable(provider: ProviderRecord, config: AppConfig): boolean {
  return (
    provider.is_accepting_bookings && visibleStatuses(config).includes(provider.verification_status)
  );
}
