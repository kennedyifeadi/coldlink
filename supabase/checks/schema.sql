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
    'public.otp_codes_phone_unconsumed_idx'
  ]) as name
  where to_regclass(name) is null;

  if missing is not null then
    raise exception 'missing relations: %', missing;
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

update public.users set full_name = 'Adebayo Ogunleye' where phone = '+2348012345678';
update public.otp_codes set attempts = 1 where phone = '+2348012345678';
update public.app_config set value = 'false' where key = 'otp_required';

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

select pg_temp.expect_denied(r.role_name, s.statement)
from (values ('anon'), ('authenticated')) as r(role_name)
cross join (
  values
    ('select * from public.users'),
    ('select * from public.otp_codes'),
    ('select * from public.app_config'),
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
