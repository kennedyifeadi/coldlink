-- PostGIS lives in the extensions schema, as Supabase recommends, so its functions and types stay
-- out of public. gen_random_uuid() is built into Postgres 13+, so pgcrypto is not needed for ids.
create extension if not exists postgis with schema extensions;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
