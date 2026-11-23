import { Cron } from 'croner';
import { describe, expect, it } from 'vitest';
import { createBookingServices } from '../services.js';
import { captureLogs, stubDatabase, testConfig } from '../test/helpers.js';
import { createJobs } from './index.js';

function nextRuns(from: string) {
  const db = stubDatabase();
  const { logger } = captureLogs();
  const services = createBookingServices({ db, config: testConfig, logger });
  return Object.fromEntries(
    createJobs({ db, logger, services }).map(({ name, schedule }) => [
      name,
      new Cron(schedule, { timezone: 'Africa/Lagos' }).nextRun(new Date(from))?.toISOString(),
    ]),
  );
}

describe('createJobs', () => {
  it('runs each job on its schedule, no two starting in the same second', () => {
    // 23:57:45 in Lagos, just before its midnight.
    expect(nextRuns('2026-11-20T22:57:45Z')).toEqual({
      release_holds: '2026-11-20T22:58:00.000Z',
      expire_unanswered: '2026-11-20T22:58:10.000Z',
      sms_queue: '2026-11-20T22:58:20.000Z',
      refund_retry: '2026-11-20T23:00:30.000Z',
      reminders: '2026-11-20T23:00:40.000Z',
      no_show_candidates: '2026-11-20T23:05:50.000Z',
    });
  });

  it('has a reminder run just after 8 AM in Lagos', () => {
    expect(nextRuns('2026-11-21T06:30:00Z')['reminders']).toBe('2026-11-21T07:00:40.000Z');
  });
});
