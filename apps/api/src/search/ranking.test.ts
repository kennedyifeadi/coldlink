import { describe, expect, it } from 'vitest';
import { displayDistanceKm, rankResults } from './ranking.js';

function result(id: string, distance_km: number, avg_rating: number) {
  return { id, distance_km, avg_rating };
}

const ids = (results: { id: string }[]) => results.map((entry) => entry.id);

describe('rankResults', () => {
  it('puts the nearest first, whatever the rating', () => {
    const ranked = rankResults([result('a', 9.4, 5), result('b', 1.2, 1), result('c', 4, 3)]);
    expect(ids(ranked)).toEqual(['b', 'c', 'a']);
  });

  it('breaks a distance tie by the higher rating', () => {
    const ranked = rankResults([result('a', 3, 3.5), result('b', 3, 4.8), result('c', 3, 0)]);
    expect(ids(ranked)).toEqual(['b', 'a', 'c']);
  });

  it('treats distances shown as the same 0.1 km as a tie', () => {
    const ranked = rankResults([result('a', 2.31, 2), result('b', 2.34, 4.5)]);
    expect(ids(ranked)).toEqual(['b', 'a']);
  });

  it('does not tie distances shown differently', () => {
    const ranked = rankResults([result('a', 2.36, 5), result('b', 2.34, 1)]);
    expect(ids(ranked)).toEqual(['b', 'a']);
  });

  it('orders a full tie by id, so the same search gives the same order', () => {
    const ranked = rankResults([result('c', 1, 4), result('a', 1, 4), result('b', 1, 4)]);
    expect(ids(ranked)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the input as it was', () => {
    const input = [result('a', 5, 1), result('b', 1, 1)];
    rankResults(input);
    expect(ids(input)).toEqual(['a', 'b']);
  });

  it('ranks nothing as nothing', () => {
    expect(rankResults([])).toEqual([]);
  });
});

describe('displayDistanceKm', () => {
  it.each([
    [0, 0],
    [0.04, 0],
    [0.05, 0.1],
    [2.349, 2.3],
    [12.25, 12.3],
  ])('shows %s km as %s km', (distance, shown) => {
    expect(displayDistanceKm(distance)).toBe(shown);
  });
});
