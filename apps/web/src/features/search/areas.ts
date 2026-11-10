// Places a farmer can search from without sharing their location. The Ibadan areas use the same
// points as the dev sample providers (supabase/seeds/dev.sql); the towns use their centres. A point
// only has to be close enough to rank cold rooms by distance, so approximate centres are enough.
export const areas = [
  { id: 'bodija', lat: 7.4335, lng: 3.9124 },
  { id: 'oje', lat: 7.392, lng: 3.914 },
  { id: 'dugbe', lat: 7.387, lng: 3.887 },
  { id: 'apata', lat: 7.3735, lng: 3.8455 },
  { id: 'iwoRoad', lat: 7.407, lng: 3.9345 },
  { id: 'moniya', lat: 7.525, lng: 3.911 },
  { id: 'sango', lat: 7.425, lng: 3.893 },
  { id: 'ojoo', lat: 7.466, lng: 3.912 },
  { id: 'challenge', lat: 7.352, lng: 3.879 },
  { id: 'oyo', lat: 7.8526, lng: 3.931 },
  { id: 'ogbomoso', lat: 8.1335, lng: 4.2407 },
  { id: 'iseyin', lat: 7.9667, lng: 3.6 },
  { id: 'saki', lat: 8.6667, lng: 3.3833 },
  { id: 'igboho', lat: 8.8333, lng: 3.7667 },
  { id: 'eruwa', lat: 7.5333, lng: 3.4167 },
  { id: 'igboOra', lat: 7.4333, lng: 3.2833 },
  { id: 'kishi', lat: 9.0833, lng: 3.85 },
] as const;

export type Area = (typeof areas)[number];
export type AreaId = Area['id'];
