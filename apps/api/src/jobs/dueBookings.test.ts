import { describe, expect, it } from 'vitest';
import { createTransitionHooks } from '../bookings/hooks.js';
import { captureLogs, stubDatabase } from '../test/helpers.js';
import { moveDueBookings } from './dueBookings.js';

const request = (bookingId: string) => ({
  bookingId,
  to: 'expired' as const,
  actor: { type: 'system' as const },
});

describe('moveDueBookings', () => {
  // The stub database has no bookings, so every transition fails with BookingNotFoundError.
  it('logs a booking that fails, skips it for the rest of the run and moves on', async () => {
    const logs = captureLogs();
    const queue = ['booking-a', 'booking-b'];
    const skips: string[][] = [];

    const result = await moveDueBookings(
      { db: stubDatabase(), hooks: createTransitionHooks(), logger: logs.logger },
      {
        job: 'release_holds',
        claim: (_trx, skip) => {
          skips.push([...skip]);
          return Promise.resolve(queue.find((id) => !skip.includes(id)));
        },
        request,
      },
    );

    expect(result).toEqual({ moved: 0, failed: 2 });
    expect(skips).toEqual([[], ['booking-a'], ['booking-a', 'booking-b']]);
    const failures = logs.lines.filter((line) =>
      line.includes('Scheduled booking transition failed'),
    );
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('"bookingId":"booking-a"');
  });

  it('stops at the batch limit', async () => {
    let claims = 0;
    const result = await moveDueBookings(
      { db: stubDatabase(), hooks: createTransitionHooks(), logger: captureLogs().logger },
      {
        job: 'release_holds',
        claim: () => {
          claims += 1;
          return Promise.resolve(`booking-${claims}`);
        },
        request,
        limit: 3,
      },
    );

    expect(result).toEqual({ moved: 0, failed: 3 });
    expect(claims).toBe(3);
  });

  it('fails the run when nothing could be claimed', async () => {
    await expect(
      moveDueBookings(
        { db: stubDatabase(), hooks: createTransitionHooks(), logger: captureLogs().logger },
        {
          job: 'release_holds',
          claim: () => Promise.reject(new Error('connection reset')),
          request,
        },
      ),
    ).rejects.toThrow('connection reset');
  });
});
