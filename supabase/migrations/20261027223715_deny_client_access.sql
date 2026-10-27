-- The browser never talks to Supabase (PRD 4.4); only the API does, over the service-role
-- connection, which bypasses RLS. Clients are denied twice over: RLS with no policies, and no
-- table privileges for anon or authenticated.

alter table public.users enable row level security;
alter table public.otp_codes enable row level security;
alter table public.app_config enable row level security;

revoke all on table public.users, public.otp_codes, public.app_config from anon, authenticated;

-- Supabase grants anon and authenticated full access to new tables and sequences in public by
-- default. Stop that for objects created by postgres, which owns every migration, so later tables
-- start without client privileges. RLS still has to be enabled on each new table.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
