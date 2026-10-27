-- Schema checks for the CI migrations job, run with psql against a fresh database after every
-- migration has been applied. Each check raises on failure. Everything runs in one transaction that
-- is rolled back, so the checks leave nothing behind.
\set ON_ERROR_STOP on

begin;

create function pg_temp.expect_check_violation(statement text, expected_constraint text)
returns void
language plpgsql
as $$
declare
  actual_constraint text;
begin
  execute statement;
  raise exception 'expected % to reject: %', expected_constraint, statement;
exception
  when check_violation then
    get stacked diagnostics actual_constraint = constraint_name;
    if actual_constraint <> expected_constraint then
      raise exception 'expected % to reject (%), but % did',
        expected_constraint, statement, actual_constraint;
    end if;
end;
$$;

create function pg_temp.expect_foreign_key_violation(statement text, expected_constraint text)
returns void
language plpgsql
as $$
declare
  actual_constraint text;
begin
  execute statement;
  raise exception 'expected % to block: %', expected_constraint, statement;
exception
  when foreign_key_violation then
    get stacked diagnostics actual_constraint = constraint_name;
    if actual_constraint <> expected_constraint then
      raise exception 'expected % to block (%), but % did',
        expected_constraint, statement, actual_constraint;
    end if;
end;
$$;

create function pg_temp.expect_denied(role_name text, statement text)
returns void
language plpgsql
as $$
begin
  execute format('set local role %I', role_name);
  execute statement;
  raise exception '% was allowed to run: %', role_name, statement;
exception
  when insufficient_privilege then
    null;
end;
$$;

do $$
begin
  if not exists (
    select
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'postgis' and n.nspname = 'extensions'
  ) then
    raise exception 'postgis is not enabled in the extensions schema';
  end if;
end;
$$;

do $$
declare
  missing text;
begin
  select string_agg(name, ', ') into missing
  from unnest(array[
    'public.users',
    'public.otp_codes',
    'public.app_config',
    'public.otp_codes_phone_unconsumed_idx',
    'public.crop_categories',
    'public.crops',
    'public.crops_category_id_name_key',
    'public.providers',
    'public.providers_location_idx',
    'public.providers_verification_status_idx',
    'public.providers_is_accepting_bookings_idx',
    'public.providers_owner_user_id_idx',
    'public.provider_crop_support',
    'public.provider_crop_support_pkey',
    'public.provider_crop_support_category_id_idx'
  ]) as name
  where to_regclass(name) is null;

  if missing is not null then
    raise exception 'missing relations: %', missing;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_am am on am.oid = c.relam
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indexrelid = 'public.providers_location_idx'::regclass
      and i.indrelid = 'public.providers'::regclass
      and am.amname = 'gist'
      and a.attname = 'location'
  ) then
    raise exception 'providers_location_idx is not a GiST index on providers.location';
  end if;

  if (
    select format_type(a.atttypid, a.atttypmod)
    from pg_attribute a
    where a.attrelid = 'public.providers'::regclass and a.attname = 'location'
  ) <> 'extensions.geography(Point,4326)' then
    raise exception 'providers.location is not extensions.geography(Point,4326)';
  end if;
end;
$$;

-- These cover every table in public, so tables added by later migrations are held to the same rules.
do $$
declare
  offenders text;
begin
  select string_agg(c.relname, ', ') into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

  if offenders is not null then
    raise exception 'RLS is not enabled on: %', offenders;
  end if;

  select string_agg(tablename || '.' || policyname, ', ') into offenders
  from pg_policies
  where schemaname = 'public';

  if offenders is not null then
    raise exception 'unexpected RLS policies: %', offenders;
  end if;

  select string_agg(r.role_name || ' on ' || c.relname, ', ') into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(role_name)
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
    and has_table_privilege(
      r.role_name, c.oid, 'select, insert, update, delete, truncate, references, trigger'
    );

  if offenders is not null then
    raise exception 'client roles have table privileges: %', offenders;
  end if;
end;
$$;

insert into public.users (phone, coldlink_id, created_at, updated_at)
values ('+2348012345678', '4820193', '2000-01-01', '2000-01-01');

insert into public.otp_codes (phone, code_hash, expires_at, created_at, updated_at)
values ('+2348012345678', 'hash', now() + interval '10 minutes', '2000-01-01', '2000-01-01');

insert into public.app_config (key, value, created_at, updated_at)
values ('otp_required', 'true', '2000-01-01', '2000-01-01');

insert into public.crop_categories (slug, name, created_at, updated_at)
values ('vegetables', 'Vegetables', '2000-01-01', '2000-01-01');

insert into public.crops (category_id, name, created_at, updated_at)
select id, 'Tomatoes', '2000-01-01', '2000-01-01' from public.crop_categories where slug = 'vegetables';

-- ST_MakePoint takes longitude first: Bodija, Ibadan is lat 7.43, lng 3.91.
insert into public.providers (
  owner_user_id, display_name, facility_type, phone, address_text, location, capacity_total,
  capacity_unit, price_per_unit_per_day_kobo, created_at, updated_at
)
select
  id,
  'Bodija Cold Room',
  'cold_room',
  '+2348012345678',
  'Bodija Market, Ibadan',
  extensions.st_setsrid(extensions.st_makepoint(3.91, 7.43), 4326)::extensions.geography,
  40,
  'crates',
  50000,
  '2000-01-01',
  '2000-01-01'
from public.users
where phone = '+2348012345678';

insert into public.provider_crop_support (provider_id, category_id, created_at, updated_at)
select p.id, c.id, '2000-01-01', '2000-01-01'
from public.providers p
cross join public.crop_categories c
where p.display_name = 'Bodija Cold Room' and c.slug = 'vegetables';

insert into public.users (phone, coldlink_id, roles, preferred_channel, home_lat, home_lng)
values (
  '+2348098765432',
  '0000001',
  '{farmer,provider,delivery_partner,admin}',
  'whatsapp',
  7.3775,
  3.947
);

do $$
declare
  u public.users;
  o public.otp_codes;
begin
  select * into u from public.users where phone = '+2348012345678';
  if u.id is null or u.roles <> '{farmer}' or u.preferred_channel <> 'web' or not u.is_active then
    raise exception 'users defaults are wrong: %', row_to_json(u);
  end if;

  select * into o from public.otp_codes where phone = '+2348012345678';
  if o.id is null or o.attempts <> 0 or o.consumed_at is not null then
    raise exception 'otp_codes defaults are wrong: %', row_to_json(o);
  end if;
end;
$$;

do $$
declare
  c public.crops;
  p public.providers;
begin
  select * into c from public.crops where name = 'Tomatoes';
  if c.id is null or c.local_names <> '{}' then
    raise exception 'crops defaults are wrong: %', row_to_json(c);
  end if;

  select * into p from public.providers where display_name = 'Bodija Cold Room';
  if p.id is null
    or p.min_storage_days <> 1
    or p.has_backup_power <> 'unknown'
    or p.verification_status <> 'pending'
    or p.verified_at is not null
    or not p.is_accepting_bookings
    or p.avg_rating <> 0
    or p.rating_count <> 0
    or p.cancellation_count <> 0
    or p.photos <> '{}'
  then
    raise exception 'providers defaults are wrong: %', row_to_json(p);
  end if;

  if extensions.st_y(p.location::extensions.geometry) <> 7.43
    or extensions.st_x(p.location::extensions.geometry) <> 3.91
  then
    raise exception 'providers.location is not Bodija (lat 7.43, lng 3.91): %',
      extensions.st_astext(p.location);
  end if;
end;
$$;

update public.users set full_name = 'Adebayo Ogunleye' where phone = '+2348012345678';
update public.otp_codes set attempts = 1 where phone = '+2348012345678';
update public.app_config set value = 'false' where key = 'otp_required';
update public.crop_categories set name = 'Fresh vegetables' where slug = 'vegetables';
update public.crops set local_names = '{tomato}' where name = 'Tomatoes';
update public.providers set landmark = 'Opposite the market gate'
where display_name = 'Bodija Cold Room';
update public.provider_crop_support set category_id = category_id;

do $$
declare
  stale text;
begin
  select string_agg(name, ', ') into stale
  from (
    select 'users' as name, created_at, updated_at from public.users where phone = '+2348012345678'
    union all
    select 'otp_codes', created_at, updated_at from public.otp_codes where phone = '+2348012345678'
    union all
    select 'app_config', created_at, updated_at from public.app_config where key = 'otp_required'
    union all
    select 'crop_categories', created_at, updated_at from public.crop_categories
    union all
    select 'crops', created_at, updated_at from public.crops
    union all
    select 'providers', created_at, updated_at from public.providers
    union all
    select 'provider_crop_support', created_at, updated_at from public.provider_crop_support
  ) as touched
  where updated_at <> now() or created_at <> '2000-01-01';

  if stale is not null then
    raise exception 'set_updated_at did not run, or changed created_at, on: %', stale;
  end if;
end;
$$;

select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id) values ('08012345678', '1000001')$$,
  'users_phone_format'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id) values ('+23480123456', '1000001')$$,
  'users_phone_format'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id) values ('+2348000000001', '123456')$$,
  'users_coldlink_id_format'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id) values ('+2348000000001', '12345678')$$,
  'users_coldlink_id_format'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id, roles)
    values ('+2348000000001', '1000001', '{farmer,driver}')$$,
  'users_roles_valid'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id, roles) values ('+2348000000001', '1000001', '{}')$$,
  'users_roles_valid'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id, roles)
    values ('+2348000000001', '1000001', '{farmer,NULL}')$$,
  'users_roles_valid'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id, preferred_channel)
    values ('+2348000000001', '1000001', 'email')$$,
  'users_preferred_channel_valid'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id, home_lat, home_lng)
    values ('+2348000000001', '1000001', 91, 3.9)$$,
  'users_home_lat_range'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id, home_lat, home_lng)
    values ('+2348000000001', '1000001', 7.4, -181)$$,
  'users_home_lng_range'
);
select pg_temp.expect_check_violation(
  $$insert into public.users (phone, coldlink_id, home_lat)
    values ('+2348000000001', '1000001', 7.4)$$,
  'users_home_location_pair'
);
select pg_temp.expect_check_violation(
  $$insert into public.otp_codes (phone, code_hash, expires_at) values ('2348012345678', 'hash', now())$$,
  'otp_codes_phone_format'
);
select pg_temp.expect_check_violation(
  $$update public.otp_codes set attempts = 6 where phone = '+2348012345678'$$,
  'otp_codes_attempts_range'
);
select pg_temp.expect_check_violation(
  $$update public.otp_codes set attempts = -1 where phone = '+2348012345678'$$,
  'otp_codes_attempts_range'
);
select pg_temp.expect_check_violation(
  $$insert into public.app_config (key, value) values ('Commission Rate', '0.075')$$,
  'app_config_key_format'
);
select pg_temp.expect_check_violation(
  $$insert into public.crop_categories (slug, name) values ('Meat Poultry', 'Meat and poultry')$$,
  'crop_categories_slug_format'
);
select pg_temp.expect_check_violation(
  $$update public.crops set shelf_life_days_ambient = 0 where name = 'Tomatoes'$$,
  'crops_shelf_life_days_ambient_positive'
);
select pg_temp.expect_check_violation(
  $$update public.crops set recommended_temp_min_c = 15, recommended_temp_max_c = 10
    where name = 'Tomatoes'$$,
  'crops_recommended_temp_order'
);
select pg_temp.expect_check_violation(
  format($$update public.providers set %s where display_name = 'Bodija Cold Room'$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$facility_type = 'warehouse'$$, 'providers_facility_type_valid'),
    ($$capacity_unit = 'litres'$$, 'providers_capacity_unit_valid'),
    ($$verification_status = 'verified'$$, 'providers_verification_status_valid'),
    ($$has_backup_power = 'inverter'$$, 'providers_has_backup_power_valid'),
    ($$phone = '08012345678'$$, 'providers_phone_format'),
    ($$whatsapp = '+14155550123'$$, 'providers_whatsapp_format'),
    ('capacity_total = 0', 'providers_capacity_total_positive'),
    ('price_per_unit_per_day_kobo = 0', 'providers_price_per_unit_per_day_kobo_positive'),
    ('min_storage_days = 0', 'providers_min_storage_days_min'),
    ('temp_min_c = 8, temp_max_c = 2', 'providers_temp_order'),
    ('avg_rating = 5.01', 'providers_avg_rating_range'),
    ('avg_rating = -1', 'providers_avg_rating_range'),
    ('rating_count = -1', 'providers_rating_count_nonnegative'),
    ('cancellation_count = -1', 'providers_cancellation_count_nonnegative'),
    ($$photos = '{a.jpg,b.jpg,c.jpg,d.jpg,e.jpg}'$$, 'providers_photos_max'),
    ($$photos = '{a.jpg,NULL}'$$, 'providers_photos_max'),
    ('verified_at = now()', 'providers_verified_at_approved')
) as v(assignment, expected_constraint);

-- The limits themselves are allowed: an approved provider with a verified_at and four photos.
update public.providers
set verification_status = 'approved', verified_at = now(), photos = '{a.jpg,b.jpg,c.jpg,d.jpg}'
where display_name = 'Bodija Cold Room';

do $$
begin
  insert into public.provider_crop_support (provider_id, category_id)
  select provider_id, category_id from public.provider_crop_support;
  raise exception 'provider_crop_support accepted a duplicate provider and category';
exception
  when unique_violation then
    null;
end;
$$;

select pg_temp.expect_foreign_key_violation(
  $$delete from public.users where phone = '+2348012345678'$$,
  'providers_owner_user_id_fkey'
);

select pg_temp.expect_denied(r.role_name, s.statement)
from (values ('anon'), ('authenticated')) as r(role_name)
cross join (
  values
    ('select * from public.users'),
    ('select * from public.otp_codes'),
    ('select * from public.app_config'),
    ('select * from public.crop_categories'),
    ('select * from public.crops'),
    ('select * from public.providers'),
    ('select * from public.provider_crop_support'),
    ($$insert into public.users (phone, coldlink_id) values ('+2348000000002', '1000002')$$),
    ($$insert into public.otp_codes (phone, code_hash, expires_at)
       values ('+2348000000002', 'hash', now())$$),
    ($$insert into public.app_config (key, value) values ('client_probe', 'true')$$),
    ('update public.users set full_name = null'),
    ('delete from public.app_config')
) as s(statement);

-- Privileges alone already deny clients. Grant them back to show RLS, with no policies, still hides
-- every row and blocks writes.
grant select, insert on public.users, public.otp_codes, public.app_config to anon;

do $$
declare
  visible bigint;
begin
  set local role anon;

  select (select count(*) from public.users)
    + (select count(*) from public.otp_codes)
    + (select count(*) from public.app_config)
  into visible;

  if visible <> 0 then
    raise exception 'RLS let anon see % rows', visible;
  end if;

  begin
    insert into public.app_config (key, value) values ('client_probe', 'true');
    raise exception 'RLS let anon insert into app_config';
  exception
    when insufficient_privilege then
      null;
  end;

  reset role;
end;
$$;

rollback;

\echo 'Schema checks passed'
