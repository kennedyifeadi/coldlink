import type * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type LucideIconName = {
  [Name in keyof typeof Icons]: (typeof Icons)[Name] extends LucideIcon ? Name : never;
}[keyof typeof Icons];

export interface ProduceOption<Id extends string = string> {
  id: Id;
  name: string;
  icon: LucideIconName;
}

export const produceOptions = [
  { id: 'tomato', name: 'Tomatoes', icon: 'Apple' }, // Placeholder icons
  { id: 'pepper', name: 'Peppers', icon: 'Flame' },
  { id: 'onion', name: 'Onions', icon: 'CircleDot' },
  { id: 'vegetables', name: 'Leafy Vegetables', icon: 'Leaf' },
  { id: 'fruits', name: 'Fruits', icon: 'Cherry' },
  { id: 'yam', name: 'Yams / Tubers', icon: 'Carrot' },
  { id: 'meat', name: 'Meat & Poultry', icon: 'Drumstick' },
  { id: 'fish', name: 'Fish & Seafood', icon: 'Fish' },
  { id: 'dairy', name: 'Dairy Products', icon: 'Milk' },
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
  image: string;
}

export const coldRooms: ColdRoom[] = [
  {
    id: 'cr-001',
    name: 'Oyo Fresh Store',
    location: 'Bodija Market, Ibadan',
    distance: 2.4, // km
    pricePerDay: 1500, // Naira
    totalCapacity: 20, // units
    availableCapacity: 10,
    supportedProduce: ['tomato', 'pepper', 'vegetables'],
    rating: 4.7,
    image:
      'https://images.unsplash.com/photo-1586528116311-ad8ed7c83a7f?q=80&w=600&auto=format&fit=crop',
  },
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
    image:
      'https://images.unsplash.com/photo-1605600659908-0ef719419d41?q=80&w=600&auto=format&fit=crop',
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
    image:
      'https://images.unsplash.com/photo-1565610222536-f1d1796be4b0?q=80&w=600&auto=format&fit=crop',
  },
];
