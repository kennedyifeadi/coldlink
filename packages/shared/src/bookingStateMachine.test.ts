import { describe, expect, it } from 'vitest';
import { canTransition, transitionActors } from './bookingStateMachine.js';
import {
  bookingEventActorTypes,
  bookingStatuses,
  type BookingEventActorType,
  type BookingStatus,
} from './enums.js';

const allowed: [BookingStatus, BookingStatus, BookingEventActorType[]][] = [
  ['payment_pending', 'pending_provider', ['system']],
  ['payment_pending', 'expired', ['system']],
  ['pending_provider', 'confirmed', ['provider', 'admin']],
  ['pending_provider', 'rejected', ['provider', 'admin']],
  ['pending_provider', 'expired', ['system']],
  ['pending_provider', 'cancelled', ['farmer']],
  ['confirmed', 'in_storage', ['provider']],
  ['confirmed', 'cancelled', ['farmer', 'provider', 'admin']],
  ['confirmed', 'no_show', ['system', 'admin']],
  ['in_storage', 'completed', ['provider']],
];

const allowedPairs = allowed.flatMap(([from, to, actors]) =>
  actors.map((actor): [BookingStatus, BookingStatus, BookingEventActorType] => [from, to, actor]),
);

function isAllowed(from: BookingStatus, to: BookingStatus, actor: BookingEventActorType): boolean {
  return allowedPairs.some(([f, t, a]) => f === from && t === to && a === actor);
}

describe('canTransition', () => {
  it.each(allowedPairs)('allows %s → %s by %s', (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(true);
  });

  it.each<[BookingStatus, BookingStatus, BookingEventActorType]>([
    ['payment_pending', 'confirmed', 'system'],
    ['payment_pending', 'cancelled', 'farmer'],
    ['pending_provider', 'payment_pending', 'system'],
    ['confirmed', 'completed', 'provider'],
    ['confirmed', 'confirmed', 'admin'],
    ['in_storage', 'cancelled', 'admin'],
    ['rejected', 'confirmed', 'admin'],
    ['expired', 'pending_provider', 'system'],
    ['cancelled', 'confirmed', 'admin'],
    ['no_show', 'in_storage', 'provider'],
    ['completed', 'in_storage', 'admin'],
  ])('refuses %s → %s, which is not a transition, even by %s', (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(false);
  });

  it.each<[BookingStatus, BookingStatus, BookingEventActorType]>([
    ['payment_pending', 'pending_provider', 'farmer'],
    ['payment_pending', 'expired', 'admin'],
    ['pending_provider', 'confirmed', 'farmer'],
    ['pending_provider', 'confirmed', 'system'],
    ['pending_provider', 'rejected', 'farmer'],
    ['pending_provider', 'expired', 'provider'],
    ['pending_provider', 'cancelled', 'provider'],
    ['pending_provider', 'cancelled', 'admin'],
    ['confirmed', 'in_storage', 'farmer'],
    ['confirmed', 'in_storage', 'admin'],
    ['confirmed', 'cancelled', 'system'],
    ['confirmed', 'cancelled', 'delivery_partner'],
    ['confirmed', 'no_show', 'provider'],
    ['confirmed', 'no_show', 'farmer'],
    ['in_storage', 'completed', 'farmer'],
    ['in_storage', 'completed', 'delivery_partner'],
  ])('refuses %s → %s by %s', (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(false);
  });

  it('lets a farmer cancel before the provider accepts (PRD 6.6)', () => {
    expect(canTransition('pending_provider', 'cancelled', 'farmer')).toBe(true);
  });

  it('allows nothing outside the listed transitions and actors', () => {
    for (const from of bookingStatuses) {
      for (const to of bookingStatuses) {
        for (const actor of bookingEventActorTypes) {
          expect(canTransition(from, to, actor), `${from} → ${to} by ${actor}`).toBe(
            isAllowed(from, to, actor),
          );
        }
      }
    }
  });
});

describe('transitionActors', () => {
  it.each(allowed)('lists who may move %s → %s', (from, to, actors) => {
    expect([...transitionActors(from, to)].sort()).toEqual([...actors].sort());
  });

  it('is empty for a move that is not a transition', () => {
    expect(transitionActors('completed', 'cancelled')).toEqual([]);
  });
});
