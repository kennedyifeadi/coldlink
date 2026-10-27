-- Crop categories each provider accepts (PRD 5.4). Keyed by the pair rather than a uuid id: a row
-- is only the link, and the key stops a provider listing a category twice (decision 24).

create table public.provider_crop_support (
  provider_id uuid not null references public.providers on delete cascade,
  category_id uuid not null references public.crop_categories on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, category_id)
);

-- Search filters providers by the crop's category, so look rows up by category as well.
create index provider_crop_support_category_id_idx on public.provider_crop_support (category_id);

create trigger provider_crop_support_set_updated_at
  before update on public.provider_crop_support
  for each row execute function public.set_updated_at();
