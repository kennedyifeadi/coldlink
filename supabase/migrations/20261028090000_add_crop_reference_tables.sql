-- Crop categories and crops (PRD 5.4). Rows come from the seed (#16). Search matches providers by
-- category; the shelf-life and temperature columns are kept for the future spoilage model and are
-- not used for filtering yet.

create table public.crop_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    constraint crop_categories_slug_format check (slug ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger crop_categories_set_updated_at
  before update on public.crop_categories
  for each row execute function public.set_updated_at();

create table public.crops (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.crop_categories on delete restrict,
  name text not null,
  local_names text[] not null default '{}',
  shelf_life_days_ambient integer
    constraint crops_shelf_life_days_ambient_positive check (shelf_life_days_ambient > 0),
  recommended_temp_min_c numeric,
  recommended_temp_max_c numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crops_category_id_name_key unique (category_id, name),
  constraint crops_recommended_temp_order check (recommended_temp_min_c <= recommended_temp_max_c)
);

create trigger crops_set_updated_at
  before update on public.crops
  for each row execute function public.set_updated_at();
