export interface Rankable {
  id: string;
  distance_km: number;
  avg_rating: number;
}

/** The distance a farmer is shown, to 0.1 km. */
export function displayDistanceKm(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}

// PRD 6.8: nearest first, ties broken by rating. A tie is the same distance as shown, so 2.31 km
// and 2.34 km, both shown as 2.3 km, are ranked by rating (decision 73). The id keeps the order
// stable between identical searches.
function compareResults(a: Rankable, b: Rankable): number {
  return (
    displayDistanceKm(a.distance_km) - displayDistanceKm(b.distance_km) ||
    b.avg_rating - a.avg_rating ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function rankResults<T extends Rankable>(results: readonly T[]): T[] {
  return results.toSorted(compareResults);
}
