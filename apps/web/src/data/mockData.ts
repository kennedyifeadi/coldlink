export interface ProduceOption<Id extends string = string> {
  id: Id;
  name: string;
}

export const produceOptions = [
  { id: 'tomato', name: 'Tomatoes' },
  { id: 'pepper', name: 'Peppers' },
  { id: 'onion', name: 'Onions' },
  { id: 'vegetables', name: 'Leafy Vegetables' },
  { id: 'fruits', name: 'Fruits' },
  { id: 'yam', name: 'Yams / Tubers' },
  { id: 'meat', name: 'Meat & Poultry' },
  { id: 'fish', name: 'Fish & Seafood' },
  { id: 'dairy', name: 'Dairy Products' },
] as const satisfies readonly ProduceOption[];

export type ProduceId = (typeof produceOptions)[number]['id'];

export interface ColdRoom {
  id: string;
  name: string;
  location: string;
  distance: number;
  pricePerDay: number;
  totalCapacity: number;
  availableCapacity: number;
  supportedProduce: ProduceId[];
  rating: number;
}

const oyoFreshStore: ColdRoom = {
  id: 'cr-001',
  name: 'Oyo Fresh Store',
  location: 'Bodija Market, Ibadan',
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
    name: 'Ibadan North Cold Storage',
    location: 'Oje Market, Ibadan',
    distance: 5.1,
    pricePerDay: 1200,
    totalCapacity: 50,
    availableCapacity: 2, // low capacity warning
    supportedProduce: ['onion', 'pepper', 'tomato'],
    rating: 4.5,
  },
  {
    id: 'cr-003',
    name: 'Moniya Hub Coolers',
    location: 'Moniya, Ibadan',
    distance: 8.5,
    pricePerDay: 1000,
    totalCapacity: 30,
    availableCapacity: 0, // full
    supportedProduce: ['fruits', 'vegetables', 'tomato'],
    rating: 4.9,
  },
];
