import { todayInLagos } from '@coldlink/shared';
import { describe, expect, it } from 'vitest';
import { captureLogs, stubDatabase } from '../test/helpers.js';
import { fakeSmsProvider, memoryNotificationStore } from '../test/notifications.js';
import { inSendWindow, remindersDue, sendReminders } from './reminders.js';

describe('inSendWindow', () => {
  it.each([
    ['2026-12-29T06:59:59Z', '7:59:59 AM', false],
    ['2026-12-29T07:00:00Z', '8:00 AM', true],
    ['2026-12-29T18:59:59Z', '7:59:59 PM', true],
    ['2026-12-29T19:00:00Z', '8:00 PM', false],
    ['2026-12-29T23:30:00Z', '0:30 AM the next day', false],
  ])('at %s (%s in Lagos) is %s', (instant, _lagos, expected) => {
    expect(inSendWindow(new Date(instant))).toBe(expected);
  });
});

describe('remindersDue', () => {
  it('is due two days before the end date, or the day before as a catch-up', () => {
    expect(remindersDue('2026-12-29').expiry_two_days_before).toEqual({
      endDateFrom: '2026-12-30',
      endDateTo: '2026-12-31',
      startsTwoDaysBeforeEnd: true,
    });
  });

  it('sends the last-day and collection reminders on the end date itself', () => {
    const due = remindersDue('2026-12-31');
    expect(due.expiry_last_day).toEqual({
      endDateFrom: '2026-12-31',
      endDateTo: '2026-12-31',
      startsTwoDaysBeforeEnd: false,
    });
    expect(due.collection_due).toEqual(due.expiry_last_day);
  });

  it('counts days on the Lagos calendar, which is a day ahead from 23:00 UTC', () => {
    // 00:30 on 31 December in Lagos, while UTC is still on the 30th.
    const today = todayInLagos(new Date('2026-12-30T23:30:00Z'));
    expect(remindersDue(today).expiry_last_day.endDateFrom).toBe('2026-12-31');
    expect(remindersDue(today).expiry_two_days_before.endDateFrom).toBe('2027-01-01');
  });
});

describe('sendReminders', () => {
  it('sends nothing outside the window', async () => {
    const table = memoryNotificationStore();
    const sms = fakeSmsProvider();
    const counts = await sendReminders({
      db: stubDatabase(),
      notifications: {
        store: table.store,
        sms: sms.provider,
        logger: captureLogs().logger,
        templates: {} as never,
      },
      now: () => new Date('2026-12-29T06:59:59Z'),
    });

    expect(counts).toEqual({ expiry_two_days_before: 0, expiry_last_day: 0, collection_due: 0 });
    expect(sms.sent).toEqual([]);
    expect(table.rows()).toEqual([]);
  });
});
