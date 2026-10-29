-- Presale listings (PRD 5.11, 7.10): created in draft when a farmer opts in at booking. Statuses
-- match packages/shared/src/enums.ts. There is no pickup_provider_id: the pickup point is the
-- storage facility, which is provider_id.
--
-- farmer_id, provider_id and crop_id repeat the booking's, so the API copies them from it.

create table public.produce_listings (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.users on delete restrict,
  provider_id uuid not null references public.providers on delete restrict,
  booking_id uuid not null unique references public.bookings on delete restrict,
  crop_id uuid not null references public.crops on delete restrict,
  title text not null,
  quantity numeric not null
    constraint produce_listings_quantity_positive check (quantity > 0),
  -- Free text, since produce is sold by the tuber, crate, kg or basket, not by storage unit.
  unit text not null,
  unit_price_kobo bigint not null
    constraint produce_listings_unit_price_kobo_positive check (unit_price_kobo > 0),
  available_quantity numeric not null,
  -- The booking's end_date, when the produce leaves storage.
  available_from date not null,
  status text not null default 'draft'
    constraint produce_listings_status_valid check (
      status in ('draft', 'active', 'sold_out', 'expired', 'cancelled')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint produce_listings_available_quantity_range check (
    available_quantity between 0 and quantity
  )
);

create index produce_listings_farmer_id_idx on public.produce_listings (farmer_id);
-- Admin review of listings (PRD 7.10).
create index produce_listings_status_created_at_idx
  on public.produce_listings (status, created_at);
create index produce_listings_crop_id_idx on public.produce_listings (crop_id);

create trigger produce_listings_set_updated_at
  before update on public.produce_listings
  for each row execute function public.set_updated_at();
