-- Deny by default (decision 21). The default privileges from deny_client_access already leave these
-- tables without client privileges; RLS has to be enabled on each.

alter table public.delivery_partners enable row level security;
alter table public.delivery_requests enable row level security;
alter table public.produce_listings enable row level security;
alter table public.listing_reservations enable row level security;
