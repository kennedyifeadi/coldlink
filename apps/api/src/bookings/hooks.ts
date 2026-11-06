import type { BookingStatus } from '@coldlink/shared';
import type { Transaction } from 'kysely';
import type { DB } from '../db/schema.js';
import type { BookingTransition } from './transition.js';

/** Which transitions a hook runs on. A missing side matches any status. */
export interface TransitionMatch {
  from?: BookingStatus;
  to?: BookingStatus;
}

interface Hook<Run> {
  /** Names the hook in logs. */
  name: string;
  on: TransitionMatch;
  run: Run;
}

/**
 * Database work that must commit or roll back with the status change, such as creating the payout
 * on check-in. It runs on the transition's transaction, after the event row is written; throwing
 * rolls the whole transition back.
 */
export type InTransactionHook = Hook<
  (trx: Transaction<DB>, transition: BookingTransition) => Promise<void>
>;

/**
 * An external effect, such as a refund or an SMS, that must never happen for a change that rolled
 * back and must not hold the booking's row lock. It runs after the commit; if it throws, the error
 * is logged and the transition stands, so it must record its own failures for a retry.
 */
export type AfterCommitHook = Hook<(transition: BookingTransition) => Promise<void>>;

/**
 * The side effects of booking transitions. Each feature registers its hooks once at startup, with
 * the dependencies it needs captured in `run`:
 *
 *   hooks.afterCommit({ name: 'refund_on_reject', on: { to: 'rejected' }, run: (t) => refund(t) });
 *
 * Hooks of one phase run in the order they were added.
 */
export interface TransitionHooks {
  inTransaction(hook: InTransactionHook): void;
  afterCommit(hook: AfterCommitHook): void;
  inTransactionFor(transition: BookingTransition): readonly InTransactionHook[];
  afterCommitFor(transition: BookingTransition): readonly AfterCommitHook[];
}

function matches({ on }: Hook<unknown>, { from, to }: BookingTransition): boolean {
  return (on.from === undefined || on.from === from) && (on.to === undefined || on.to === to);
}

export function createTransitionHooks(): TransitionHooks {
  const inTransaction: InTransactionHook[] = [];
  const afterCommit: AfterCommitHook[] = [];
  return {
    inTransaction: (hook) => {
      inTransaction.push(hook);
    },
    afterCommit: (hook) => {
      afterCommit.push(hook);
    },
    inTransactionFor: (transition) => inTransaction.filter((hook) => matches(hook, transition)),
    afterCommitFor: (transition) => afterCommit.filter((hook) => matches(hook, transition)),
  };
}
