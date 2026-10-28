-- Deny by default (decision 21). The default privileges from deny_client_access already leave these
-- tables without client privileges; RLS has to be enabled on each.

alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.ratings enable row level security;
alter table public.notifications enable row level security;
alter table public.action_tokens enable row level security;
alter table public.search_logs enable row level security;
alter table public.booking_reminders enable row level security;
