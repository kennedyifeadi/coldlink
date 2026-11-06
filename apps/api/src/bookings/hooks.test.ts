import { describe, expect, it } from 'vitest';
import { createTransitionHooks, type AfterCommitHook } from './hooks.js';
import type { BookingTransition } from './transition.js';

const accepted: BookingTransition = {
  bookingId: 'b-1',
  from: 'pending_provider',
  to: 'confirmed',
  actor: { type: 'provider', id: 'p-1' },
  eventId: 'e-1',
  metadata: {},
};

function afterCommit(name: string, on: AfterCommitHook['on']): AfterCommitHook {
  return { name, on, run: () => Promise.resolve() };
}

describe('createTransitionHooks', () => {
  it('picks the hooks whose from and to match, in the order they were added', () => {
    const hooks = createTransitionHooks();
    hooks.afterCommit(afterCommit('any', {}));
    hooks.afterCommit(afterCommit('to_confirmed', { to: 'confirmed' }));
    hooks.afterCommit(afterCommit('to_rejected', { to: 'rejected' }));
    hooks.afterCommit(afterCommit('from_pending', { from: 'pending_provider' }));
    hooks.afterCommit(afterCommit('from_confirmed', { from: 'confirmed' }));
    hooks.afterCommit(afterCommit('exact', { from: 'pending_provider', to: 'confirmed' }));
    hooks.afterCommit(afterCommit('wrong_from', { from: 'payment_pending', to: 'confirmed' }));

    expect(hooks.afterCommitFor(accepted).map((hook) => hook.name)).toEqual([
      'any',
      'to_confirmed',
      'from_pending',
      'exact',
    ]);
  });

  it('keeps the two phases apart', () => {
    const hooks = createTransitionHooks();
    hooks.inTransaction({ name: 'payout', on: { to: 'confirmed' }, run: () => Promise.resolve() });

    expect(hooks.inTransactionFor(accepted).map((hook) => hook.name)).toEqual(['payout']);
    expect(hooks.afterCommitFor(accepted)).toEqual([]);
  });

  it('matches nothing when no hook is registered', () => {
    const hooks = createTransitionHooks();
    expect(hooks.inTransactionFor(accepted)).toEqual([]);
    expect(hooks.afterCommitFor(accepted)).toEqual([]);
  });
});
