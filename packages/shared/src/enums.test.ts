import { describe, expect, it } from 'vitest';
import {
  actionTokenPurposeSchema,
  bookingEventActorTypeSchema,
  bookingReminderKindSchema,
  notificationChannelSchema,
  notificationStatusSchema,
  paymentPurposeSchema,
  payoutStatusSchema,
  searchChannelSchema,
} from './enums.js';

// Database check constraints repeat these values, so a change here needs a migration too.
describe.each([
  {
    name: 'payment purpose',
    schema: paymentPurposeSchema,
    values: ['booking_deposit', 'delivery_fee', 'refund'],
    rejected: ['deposit'],
  },
  {
    name: 'payout status',
    schema: payoutStatusSchema,
    values: ['owed', 'paid'],
    rejected: ['due'],
  },
  {
    name: 'booking event actor type',
    schema: bookingEventActorTypeSchema,
    values: ['farmer', 'provider', 'delivery_partner', 'system', 'admin'],
    rejected: ['user'],
  },
  {
    name: 'booking reminder kind',
    schema: bookingReminderKindSchema,
    values: ['expiry_two_days_before', 'expiry_last_day', 'collection_due'],
    rejected: ['expiry_reminder'],
  },
  {
    name: 'notification channel',
    schema: notificationChannelSchema,
    values: ['sms', 'whatsapp'],
    rejected: ['web'],
  },
  {
    name: 'notification status',
    schema: notificationStatusSchema,
    values: ['queued', 'sent', 'failed'],
    rejected: ['delivered'],
  },
  {
    name: 'action token purpose',
    schema: actionTokenPurposeSchema,
    values: [
      'provider_accept_booking',
      'provider_reject_booking',
      'delivery_accept',
      'delivery_update',
    ],
    rejected: ['login'],
  },
  {
    name: 'search channel',
    schema: searchChannelSchema,
    values: ['web', 'whatsapp', 'sms'],
    rejected: ['ussd'],
  },
])('$name', ({ schema, values, rejected }) => {
  it('has exactly the values the database allows', () => {
    expect(schema.options).toEqual(values);
  });

  it.each(rejected)('rejects %s', (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
