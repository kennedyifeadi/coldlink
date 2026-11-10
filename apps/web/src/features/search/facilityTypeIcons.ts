import { Boxes, Package, Refrigerator, Snowflake, Warehouse, type LucideIcon } from 'lucide-react';
import type { FacilityType } from '@coldlink/shared';

// Shown beside the type's name (search.facilityTypes), never on its own.
export const facilityTypeIcons: Record<FacilityType, LucideIcon> = {
  cold_room: Warehouse,
  chest_freezer: Snowflake,
  fridge: Refrigerator,
  fridge_fleet: Boxes,
  other: Package,
};
