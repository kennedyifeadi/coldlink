-- Storage providers (PRD 5.3). Enum-like values match packages/shared/src/enums.ts.
-- cancellation_count is not in PRD 5.3 but PRD 6.6 needs it (decision 23).

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  -- Restrict, not cascade: a provider's bookings and payouts must outlive any attempt to delete its
  -- owner. Owners are deactivated with users.is_active instead.
  owner_user_id uuid not null references public.users on delete restrict,
  business_name text,
  display_name text not null,
  facility_type text not null
    constraint providers_facility_type_valid check (
      facility_type in ('cold_room', 'chest_freezer', 'fridge', 'fridge_fleet', 'other')
    ),
  description text,
  phone text not null
    constraint providers_phone_format check (phone ~ '^\+234[0-9]{10}$'),
  whatsapp text
    constraint providers_whatsapp_format check (whatsapp ~ '^\+234[0-9]{10}$'),
  address_text text not null,
  landmark text,
  lga text,
  location extensions.geography(Point, 4326) not null,
  capacity_total numeric not null
    constraint providers_capacity_total_positive check (capacity_total > 0),
  capacity_unit text not null
    constraint providers_capacity_unit_valid check (capacity_unit in ('sqm', 'crates', 'kg')),
  price_per_unit_per_day_kobo bigint not null
    constraint providers_price_per_unit_per_day_kobo_positive check (
      price_per_unit_per_day_kobo > 0
    ),
  min_storage_days integer not null default 1
    constraint providers_min_storage_days_min check (min_storage_days >= 1),
  temp_min_c numeric,
  temp_max_c numeric,
  has_backup_power text not null default 'unknown'
    constraint providers_has_backup_power_valid check (
      has_backup_power in ('generator', 'solar', 'none', 'unknown')
    ),
  verification_status text not null default 'pending'
    constraint providers_verification_status_valid check (
      verification_status in ('pending', 'approved', 'suspended', 'rejected')
    ),
  verified_at timestamptz,
  is_accepting_bookings boolean not null default true,
  avg_rating numeric(3, 2) not null default 0
    constraint providers_avg_rating_range check (avg_rating between 0 and 5),
  rating_count integer not null default 0
    constraint providers_rating_count_nonnegative check (rating_count >= 0),
  cancellation_count integer not null default 0
    constraint providers_cancellation_count_nonnegative check (cancellation_count >= 0),
  photos text[] not null default '{}'
    constraint providers_photos_max check (
      cardinality(photos) <= 4 and array_position(photos, null) is null
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_temp_order check (temp_min_c <= temp_max_c),
  constraint providers_verified_at_approved check (
    verified_at is null or verification_status = 'approved'
  )
);

create index providers_location_idx on public.providers using gist (location);
create index providers_verification_status_idx on public.providers (verification_status);
create index providers_is_accepting_bookings_idx on public.providers (is_accepting_bookings);
create index providers_owner_user_id_idx on public.providers (owner_user_id);

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();
