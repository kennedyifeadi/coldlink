// Display text for produce and cold rooms lives in the English resources under mock.produce.<id>
// and mock.coldRooms.<id>, so a typo'd or missing id fails typecheck.
export const produceIds = [
  'tomato',
  'pepper',
  'onion',
  'vegetables',
  'fruits',
  'yam',
  'meat',
  'fish',
  'dairy',
] as const;

export type ProduceId = (typeof produceIds)[number];

export type ColdRoomId = 'cr-001' | 'cr-002' | 'cr-003';

export interface ColdRoom {
  id: ColdRoomId;
  distance: number;
  pricePerDay: number;
  totalCapacity: number;
  availableCapacity: number;
  supportedProduce: ProduceId[];
  rating: number;
}

const oyoFreshStore: ColdRoom = {
  id: 'cr-001',
  distance: 2.4, // km
  pricePerDay: 1500, // Naira
  totalCapacity: 20, // units
  availableCapacity: 10,
  supportedProduce: ['tomato', 'pepper', 'vegetables'],
  rating: 4.7,
};

// Details, Review and Confirmation show this room until the chosen one is passed through the flow (#32–#34).
export const sampleColdRoom = oyoFreshStore;

export const coldRooms: ColdRoom[] = [
  oyoFreshStore,
  {
    id: 'cr-002',
    distance: 5.1,
    pricePerDay: 1200,
    totalCapacity: 50,
    availableCapacity: 2, // low capacity warning
    supportedProduce: ['onion', 'pepper', 'tomato'],
    rating: 4.5,
  },
  {
    id: 'cr-003',
    distance: 8.5,
    pricePerDay: 1000,
    totalCapacity: 30,
    availableCapacity: 0, // full
    supportedProduce: ['fruits', 'vegetables', 'tomato'],
    rating: 4.9,
  },
];
