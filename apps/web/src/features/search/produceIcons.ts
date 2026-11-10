import { Carrot, Cherry, Drumstick, Fish, Leaf, Milk, Shapes, type LucideIcon } from 'lucide-react';

// Placeholder icons, one per crop category, until the design assets include produce artwork.
const categoryIcons: Record<string, LucideIcon> = {
  vegetables: Leaf,
  fruits: Cherry,
  tubers: Carrot,
  fish: Fish,
  meat_poultry: Drumstick,
  dairy: Milk,
};

/** A category added after this list gets the generic icon rather than none. */
export const produceIcon = (categorySlug: string): LucideIcon =>
  categoryIcons[categorySlug] ?? Shapes;
