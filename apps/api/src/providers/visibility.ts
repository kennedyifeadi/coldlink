import type { AppConfig, VerificationStatus } from '@coldlink/shared';

// Suspended and rejected providers stay hidden even when approval is not required (decision 72).
export function visibleStatuses(config: AppConfig): VerificationStatus[] {
  return config.require_provider_approval ? ['approved'] : ['approved', 'pending'];
}
