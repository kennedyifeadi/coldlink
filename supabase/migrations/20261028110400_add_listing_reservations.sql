-- Buyer reservations on presale listings (PRD 5.11). Reserved for the phase-2 marketplace (PRD 15):
-- the table exists so activating it needs no migration of existing data, but nothing writes to it
-- yet. Statuses match packages/shared/src/enums.ts.

create table public.listing_reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.produce_listings on delete restrict,
  buyer_name text not null,
  buyer_phone text not null
    constraint listing_reservations_buyer_phone_format check (buyer_phone ~ '^\+234[0-9]{10}$'),
  quantity numeric not null
    constraint listing_reservations_quantity_positive check (quantity > 0),
  total_kobo bigint not null
    constraint listing_reservations_total_kobo_positive check (total_kobo > 0),
  deposit_percent numeric not null default 0.20
    constraint listing_reservations_deposit_percent_range check (
      deposit_percent > 0 and deposit_percent <= 1
    ),
  deposit_kobo bigint not null,
  status text not null
    constraint listing_reservations_status_valid check (
      status in ('payment_pending', 'confirmed', 'completed', 'expired', 'cancelled')
    ),
  pickup_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Rounded half up to whole kobo, as the booking deposit is (decisions 17 and 26).
  constraint listing_reservations_deposit_consistent check (
    deposit_kobo = round(deposit_percent * total_kobo)
  )
);

create index listing_reservations_listing_id_idx on public.listing_reservations (listing_id);

create trigger listing_reservations_set_updated_at
  before update on public.listing_reservations
  for each row execute function public.set_updated_at();
