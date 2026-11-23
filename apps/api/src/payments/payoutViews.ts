import { payoutStatusSchema, type ProviderPayout } from '@coldlink/shared';
import type { ProviderPayoutRow } from './payoutStore.js';

export function toProviderPayout(row: ProviderPayoutRow): ProviderPayout {
  return {
    id: row.id,
    amount_kobo: row.amount_kobo,
    status: payoutStatusSchema.parse(row.status),
    created_at: row.created_at.toISOString(),
    paid_at: row.paid_at?.toISOString() ?? null,
    reference: row.reference,
    booking: {
      id: row.booking_id,
      code: row.booking_code,
      crop: { id: row.crop_id, name: row.crop_name },
      start_date: row.start_date,
      duration_days: row.duration_days,
      end_date: row.end_date,
    },
  };
}
