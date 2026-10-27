-- Deny by default (decision 21). The default privileges from deny_client_access already leave these
-- tables without client privileges; RLS has to be enabled on each.

alter table public.crop_categories enable row level security;
alter table public.crops enable row level security;
alter table public.providers enable row level security;
alter table public.provider_crop_support enable row level security;
