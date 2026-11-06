import { describe, expect, it } from 'vitest';
import { captureLogs } from '../test/helpers.js';
import type { AfterCommitHook } from './hooks.js';
import {
  BookingNotFoundError,
  BookingTransitionError,
  runAfterCommitHooks,
  type BookingTransition,
} from './transition.js';

const rejected: BookingTransition = {
  bookingId: 'b-1',
  from: 'pending_provider',
  to: 'rejected',
  actor: { type: 'provider', id: 'p-1' },
  eventId: 'e-1',
  metadata: {},
};

describe('runAfterCommitHooks', () => {
  it('runs every hook in order, logs a failure and carries on', async () => {
    const ran: string[] = [];
    const afterCommit: AfterCommitHook[] = [
      {
        name: 'refund',
        on: {},
        run: () => {
          ran.push('refund');
          return Promise.reject(new Error('Paystack is down'));
        },
      },
      {
        name: 'notify',
        on: {},
        run: () => {
          ran.push('notify');
          return Promise.resolve();
        },
      },
    ];
    const logs = captureLogs();

    await expect(
      runAfterCommitHooks(logs.logger, { transition: rejected, afterCommit }),
    ).resolves.toBeUndefined();

    expect(ran).toEqual(['refund', 'notify']);
    const [line, ...rest] = logs.lines.map((entry) => JSON.parse(entry) as Record<string, unknown>);
    expect(rest).toEqual([]);
    expect(line).toMatchObject({
      level: 50,
      msg: 'Booking after-commit hook failed',
      hook: 'refund',
      bookingId: 'b-1',
      from: 'pending_provider',
      to: 'rejected',
      err: { message: 'Paystack is down' },
    });
  });
});

describe('booking errors', () => {
  it('reports an illegal transition as a 409 conflict', () => {
    const error = new BookingTransitionError(
      'not_a_transition',
      'b-1',
      'completed',
      'cancelled',
      'admin',
    );
    expect(error.status).toBe(409);
    expect(error.toResponse()).toEqual({
      error: {
        code: 'conflict',
        message: 'A completed booking cannot become cancelled',
        details: { booking_id: 'b-1', from: 'completed', to: 'cancelled', actor_type: 'admin' },
      },
    });
  });

  it('names the actor when the actor may not make the transition', () => {
    const error = new BookingTransitionError(
      'actor_not_allowed',
      'b-1',
      'pending_provider',
      'confirmed',
      'farmer',
    );
    expect(error.status).toBe(409);
    expect(error.message).toBe('A farmer cannot move a booking from pending_provider to confirmed');
  });

  it('reports a missing booking as a 404', () => {
    expect(new BookingNotFoundError('b-1').toResponse()).toEqual({
      error: { code: 'not_found', message: 'Booking not found', details: { booking_id: 'b-1' } },
    });
  });
});
