// Confirmation still shows this sample room until it is built on the API (#34). Its display text
// lives under mock.coldRooms.<id> in the English resources, so a typo'd id fails typecheck.
export type ColdRoomId = 'cr-001';

export interface ColdRoom {
  id: ColdRoomId;
}

export const sampleColdRoom: ColdRoom = { id: 'cr-001' };
