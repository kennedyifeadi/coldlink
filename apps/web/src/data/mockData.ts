// The booking screens (Details, Review, Confirmation) still show this sample room until they are
// built on the API (#33, #34). Its display text lives under mock.coldRooms.<id> in the English
// resources, so a typo'd id fails typecheck. Search no longer uses it.
export type ColdRoomId = 'cr-001';

export interface ColdRoom {
  id: ColdRoomId;
  distance: number;
  totalCapacity: number;
  availableCapacity: number;
  rating: number;
}

export const sampleColdRoom: ColdRoom = {
  id: 'cr-001',
  distance: 2.4, // km
  totalCapacity: 20, // units
  availableCapacity: 10,
  rating: 4.7,
};
