-- Delivery partners (PRD 5.10): the logistics providers ColdLink dispatches jobs to. Vehicle types
-- match packages/shared/src/enums.ts.

create table public.delivery_partners (
  id uuid primary key default gen_random_uuid(),
  -- Restrict, as for provider owners (decision 25): a partner's delivery history must outlive any
  -- attempt to delete its user. Partners are deactivated with is_active instead.
  user_id uuid not null unique references public.users on delete restrict,
  company_name text not null,
  phone text not null
    constraint delivery_partners_phone_format check (phone ~ '^\+234[0-9]{10}$'),
  vehicle_types text[] not null
    constraint delivery_partners_vehicle_types_valid check (
      cardinality(vehicle_types) > 0
      and array_position(vehicle_types, null) is null
      and vehicle_types <@ array['bike', 'tricycle', 'van', 'truck']
    ),
  coverage_lgas text[] not null default '{}'
    constraint delivery_partners_coverage_lgas_no_nulls check (
      array_position(coverage_lgas, null) is null
    ),
  is_active boolean not null default true,
  avg_rating numeric(3, 2) not null default 0
    constraint delivery_partners_avg_rating_range check (avg_rating between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger delivery_partners_set_updated_at
  before update on public.delivery_partners
  for each row execute function public.set_updated_at();
