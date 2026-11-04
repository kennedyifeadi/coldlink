-- Dev seed checks for the CI migrations job, run with psql after `scripts/db-seed-dev.mjs` has
-- loaded supabase/seeds/dev.sql twice into the throwaway database. Each check raises on failure.
-- Everything runs in one transaction that is rolled back.
\set ON_ERROR_STOP on

begin;

create temporary view sample_providers as
select p.*
from public.providers p
join public.users u on u.id = p.owner_user_id
where u.phone like '+23480000000%';

do $$
declare
  unmarked text;
begin
  if (select count(*) from sample_providers) <> 9
    or (select count(*) from public.users where phone like '+23480000000%') <> 9
  then
    raise exception 'expected 9 sample owners with one provider each, found % providers',
      (select count(*) from sample_providers);
  end if;

  select string_agg(display_name, ', ') into unmarked
  from sample_providers p
  join public.users u on u.id = p.owner_user_id
  where p.display_name not like '% (Sample)'
    or p.description <> 'Development sample data, not a real storage provider.'
    or u.full_name not like '% (dev data)'
    or u.roles <> '{provider}';

  if unmarked is not null then
    raise exception 'sample rows not marked as sample data: %', unmarked;
  end if;

  if (
    select array_agg(verification_status order by verification_status)
    from sample_providers
  ) <> '{approved,approved,approved,approved,approved,approved,approved,pending,suspended}' then
    raise exception 'sample providers should be 7 approved, 1 pending and 1 suspended';
  end if;

  if exists (
    select
    from sample_providers p
    where not exists (select from public.provider_crop_support s where s.provider_id = p.id)
  ) then
    raise exception 'a sample provider supports no crop category';
  end if;

  if exists (select from public.bookings b join sample_providers p on p.id = b.provider_id) then
    raise exception 'the dev seed must not create bookings';
  end if;
end;
$$;

-- A third run, inside this transaction, adds and changes nothing.
create temporary table dev_seed_snapshot as
select 'users' as source, to_jsonb(u) as row from public.users u where phone like '+23480000000%'
union all
select 'providers', to_jsonb(p) from public.providers p
union all
select 'provider_crop_support', to_jsonb(s) from public.provider_crop_support s;

select set_config('coldlink.seed_target', 'dev', true);
\ir ../seeds/dev.sql

do $$
declare
  changed bigint;
begin
  select count(*) into changed
  from (
    (
      select 'users' as source, to_jsonb(u) as row
      from public.users u
      where phone like '+23480000000%'
      union all
      select 'providers', to_jsonb(p) from public.providers p
      union all
      select 'provider_crop_support', to_jsonb(s) from public.provider_crop_support s
    )
    except all
    select source, row from dev_seed_snapshot
  ) as added_or_changed;

  if changed <> 0 then
    raise exception 'running the dev seed again added or changed % rows', changed;
  end if;
end;
$$;

-- PRD Phase 2 acceptance: a search from central Ibadan (lat 7.3775, lng 3.947) at the default radius
-- returns the approved providers nearest first. providers_within_radius is purely geographic, so the
-- approval filter the search endpoint applies (decision 39) is applied here; the pending and
-- suspended providers are within the radius and are what it removes.
do $$
declare
  radius_km numeric;
  within_count bigint;
  found text[];
begin
  select (value #>> '{}')::numeric into radius_km
  from public.app_config
  where key = 'search_default_radius_km';

  select
    count(*),
    array_agg(p.display_name order by r.ord)
      filter (where p.verification_status = 'approved' and p.is_accepting_bookings)
  into within_count, found
  from public.providers_within_radius(7.3775, 3.947, radius_km)
    with ordinality as r(provider_id, distance_km, ord)
  join sample_providers p on p.id = r.provider_id;

  if within_count <> 9 then
    raise exception 'expected all 9 sample providers within % km, found %', radius_km, within_count;
  end if;

  if found is distinct from array[
    'Iwo Road Cold Room (Sample)',
    'Oje Market Freezers (Sample)',
    'Dugbe Fridge Fleet (Sample)',
    'Bodija Cold Room (Sample)',
    'Sango Spare Fridge (Sample)',
    'Apata Cold Store (Sample)',
    'Moniya Produce Cold Room (Sample)'
  ] then
    raise exception 'approved sample providers by distance are wrong: %', found;
  end if;
end;
$$;

-- With no bookings, every sample provider has its whole capacity free.
do $$
declare
  short text;
begin
  select string_agg(display_name, ', ') into short
  from sample_providers
  where public.provider_available_quantity(id, current_date, current_date + 30) <> capacity_total;

  if short is not null then
    raise exception 'sample providers without their full capacity available: %', short;
  end if;
end;
$$;

rollback;

\echo 'Dev seed checks passed'
