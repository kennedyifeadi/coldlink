import {
  Apple,
  Carrot,
  Cherry,
  CircleDot,
  Drumstick,
  Fish,
  Flame,
  Leaf,
  Milk,
  Shapes,
  type LucideIcon,
} from 'lucide-react';
import type { ProduceId } from '../../data/mockData';

export type ProduceChoice = ProduceId | 'other';

// Placeholder icons until the design assets include produce artwork.
export const produceIcons: Record<ProduceChoice, LucideIcon> = {
  tomato: Apple,
  pepper: Flame,
  onion: CircleDot,
  vegetables: Leaf,
  fruits: Cherry,
  yam: Carrot,
  meat: Drumstick,
  fish: Fish,
  dairy: Milk,
  other: Shapes,
};
