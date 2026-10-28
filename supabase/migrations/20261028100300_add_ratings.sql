-- Ratings (PRD 5.9, 6.7): one per booking, from its farmer about its provider.

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings on delete restrict,
  farmer_id uuid not null references public.users on delete restrict,
  provider_id uuid not null references public.providers on delete restrict,
  stars integer not null
    constraint ratings_stars_range check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recomputing a provider's avg_rating reads all of its ratings.
create index ratings_provider_id_idx on public.ratings (provider_id);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();
