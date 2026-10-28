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

create function pg_temp.expect_unique_violation(statement text, expected_constraint text)
returns void
language plpgsql
as $$
declare
  actual_constraint text;
begin
  execute statement;
  raise exception 'expected % to reject: %', expected_constraint, statement;
exception
  when unique_violation then
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
    'public.provider_crop_support_category_id_idx',
    'public.bookings',
    'public.bookings_code_key',
    'public.bookings_provider_capacity_idx',
    'public.bookings_provider_id_created_at_idx',
    'public.bookings_farmer_id_created_at_idx',
    'public.bookings_status_payment_expires_at_idx',
    'public.bookings_status_provider_response_due_at_idx',
    'public.bookings_status_end_date_idx',
    'public.booking_events',
    'public.booking_events_booking_id_created_at_idx',
    'public.payments',
    'public.payments_provider_ref_key',
    'public.payments_booking_id_idx',
    'public.payouts',
    'public.payouts_booking_id_key',
    'public.payouts_provider_id_status_idx',
    'public.payouts_status_created_at_idx',
    'public.ratings',
    'public.ratings_booking_id_key',
    'public.ratings_provider_id_idx',
    'public.notifications',
    'public.notifications_status_created_at_idx',
    'public.notifications_user_id_idx',
    'public.action_tokens',
    'public.action_tokens_token_hash_key',
    'public.action_tokens_expires_at_idx',
    'public.action_tokens_subject_id_idx',
    'public.search_logs',
    'public.search_logs_created_at_idx',
    'public.search_logs_user_id_idx',
    'public.booking_reminders',
    'public.booking_reminders_booking_id_kind_key',
    'public.delivery_partners',
    'public.delivery_partners_user_id_key',
    'public.delivery_requests',
    'public.delivery_requests_context_idx',
    'public.delivery_requests_status_created_at_idx',
    'public.delivery_requests_partner_id_idx',
    'public.payments_delivery_request_id_idx',
    'public.produce_listings',
    'public.produce_listings_booking_id_key',
    'public.produce_listings_farmer_id_idx',
    'public.produce_listings_status_created_at_idx',
    'public.produce_listings_crop_id_idx',
    'public.listing_reservations',
    'public.listing_reservations_listing_id_idx',
    'public.v_listing_price_observations'
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

  if not exists (
    select
    from pg_attribute a
    where a.attrelid = 'public.providers'::regclass
      and a.attname = 'location'
      and a.atttypid = 'extensions.geography'::regtype
      and extensions.postgis_typmod_type(a.atttypmod) = 'Point'
      and extensions.postgis_typmod_srid(a.atttypmod) = 4326
  ) then
    raise exception 'providers.location is not extensions.geography(Point,4326)';
  end if;

  if (
    select count(*)
    from pg_attribute a
    where a.attrelid = 'public.delivery_requests'::regclass
      and a.attname in ('pickup_location', 'dropoff_location')
      and a.atttypid = 'extensions.geography'::regtype
      and extensions.postgis_typmod_type(a.atttypmod) = 'Point'
      and extensions.postgis_typmod_srid(a.atttypmod) = 4326
  ) <> 2 then
    raise exception 'delivery_requests locations are not extensions.geography(Point,4326)';
  end if;

  -- Without it the view runs as its owner, which skips RLS on produce_listings.
  if not exists (
    select
    from pg_class
    where oid = 'public.v_listing_price_observations'::regclass
      and 'security_invoker=true' = any(reloptions)
  ) then
    raise exception 'v_listing_price_observations does not have security_invoker set';
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

-- Bookings and the tables around them. Moniya Cold Room is priced like the PRD 6.1 worked example.
insert into public.providers (
  owner_user_id, display_name, facility_type, phone, address_text, location, capacity_total,
  capacity_unit, price_per_unit_per_day_kobo
)
select
  id,
  'Moniya Cold Room',
  'cold_room',
  '+2348098765432',
  'Moniya, Ibadan',
  extensions.st_setsrid(extensions.st_makepoint(3.88, 7.53), 4326)::extensions.geography,
  10,
  'sqm',
  225800
from public.users
where phone = '+2348098765432';

-- PRD 6.1 worked example in kobo: 2 sqm × 30 days × 225,800 = 13,548,000; commission at 7.5% =
-- 1,016,100; deposit at 30% = 4,064,400; balance 9,483,600; no service or delivery fee. The same
-- figures are in packages/shared/src/pricing.test.ts. delivery_fee_kobo is left to its default.
insert into public.bookings (
  code, farmer_id, provider_id, crop_id, quantity, capacity_unit, start_date, duration_days,
  end_date, status, unit_price_kobo, storage_subtotal_kobo, commission_rate, commission_kobo,
  service_fee_kobo, deposit_percent, deposit_kobo, balance_due_kobo, total_charged_online_kobo,
  created_at, updated_at
)
select
  'CL-7K3Q9', u.id, p.id, c.id, 2, 'sqm', '2026-11-02', 30, '2026-12-02', 'confirmed',
  225800, 13548000, 0.075, 1016100, 0, 0.30, 4064400, 9483600, 4064400,
  '2000-01-01', '2000-01-01'
from public.users u
cross join public.providers p
cross join public.crops c
where u.phone = '+2348098765432' and p.display_name = 'Moniya Cold Room' and c.name = 'Tomatoes';

-- Rounding cases from pricing.test.ts, to show the checks round half up as the pricing module does:
-- 2.5 × 3 days × 333 = 2,497.5, so the subtotal is 2,498; and 200 × 7.25% = 14.5, so the
-- commission is 15.
insert into public.bookings (
  code, farmer_id, provider_id, crop_id, quantity, capacity_unit, start_date, duration_days,
  end_date, status, unit_price_kobo, storage_subtotal_kobo, commission_rate, commission_kobo,
  service_fee_kobo, deposit_percent, deposit_kobo, balance_due_kobo, total_charged_online_kobo
)
select v.code, u.id, p.id, c.id, v.quantity, 'sqm', '2026-11-02', v.duration_days,
  '2026-11-02'::date + v.duration_days, 'payment_pending', v.unit_price_kobo, v.subtotal,
  v.commission_rate, v.commission, 0, 0.30, v.deposit, v.subtotal - v.deposit, v.deposit
from (
  values
    ('CL-H4LF2', 2.5, 3, 333, 2498, 0.075, 187, 749),
    ('CL-RW8NX', 1, 1, 200, 200, 0.0725, 15, 60)
) as v(code, quantity, duration_days, unit_price_kobo, subtotal, commission_rate, commission, deposit)
cross join public.users u
cross join public.providers p
cross join public.crops c
where u.phone = '+2348098765432' and p.display_name = 'Moniya Cold Room' and c.name = 'Tomatoes';

insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id)
select id, null, 'payment_pending', 'farmer', farmer_id
from public.bookings
where code in ('CL-7K3Q9', 'CL-RW8NX');

insert into public.booking_events (booking_id, from_status, to_status, actor_type, metadata)
select b.id, v.from_status, v.to_status, v.actor_type, v.metadata::jsonb
from public.bookings b
cross join (
  values
    ('payment_pending', 'pending_provider', 'system', '{"provider_ref": "T-0001"}'),
    ('pending_provider', 'confirmed', 'provider', '{"via": "action_token"}')
) as v(from_status, to_status, actor_type, metadata)
where b.code = 'CL-7K3Q9';

insert into public.payments (
  booking_id, provider_ref, purpose, amount_kobo, status, paystack_payload, paid_at, created_at,
  updated_at
)
select id, 'T-0001', 'booking_deposit', 4064400, 'success', '{"status": "success"}', now(),
  '2000-01-01', '2000-01-01'
from public.bookings
where code = 'CL-7K3Q9';

insert into public.payments (booking_id, provider_ref, purpose, amount_kobo)
select id, 'T-0002', 'booking_deposit', 4064400 from public.bookings where code = 'CL-7K3Q9';

insert into public.users (phone, coldlink_id, roles)
values ('+2348030000001', '3000001', '{delivery_partner}');

insert into public.delivery_partners (
  user_id, company_name, phone, vehicle_types, created_at, updated_at
)
select id, 'Ibadan Swift Logistics', '+2348030000001', '{bike,van}', '2000-01-01', '2000-01-01'
from public.users
where phone = '+2348030000001';

-- Inbound delivery for the worked-example booking, from a farm in Akinyele to Moniya Cold Room. The
-- fee is split 80% to the partner and 20% to ColdLink.
insert into public.delivery_requests (
  context_type, context_id, requested_by, pickup_text, pickup_location, dropoff_text,
  dropoff_location, contact_phone, load_description, load_quantity, load_unit, distance_km,
  vehicle_type, fee_kobo, partner_payout_kobo, platform_margin_kobo, status, handover_code,
  created_at, updated_at
)
select
  'booking_inbound',
  b.id,
  b.farmer_id,
  'Akinyele farm road, Ibadan',
  extensions.st_setsrid(extensions.st_makepoint(3.85, 7.55), 4326)::extensions.geography,
  'Moniya Cold Room',
  p.location,
  '+2348098765432',
  'Tomatoes in crates',
  20,
  'crates',
  4.2,
  'van',
  100000,
  80000,
  20000,
  'requested',
  '0427',
  '2000-01-01',
  '2000-01-01'
from public.bookings b
join public.providers p on p.id = b.provider_id
where b.code = 'CL-7K3Q9';

insert into public.payments (booking_id, delivery_request_id, provider_ref, purpose, amount_kobo)
select context_id, id, 'T-0003', 'delivery_fee', fee_kobo
from public.delivery_requests;

select pg_temp.expect_foreign_key_violation(
  $$insert into public.payments (booking_id, delivery_request_id, provider_ref, purpose, amount_kobo)
    select id, gen_random_uuid(), 'T-0004', 'delivery_fee', 100000
    from public.bookings
    where code = 'CL-7K3Q9'$$,
  'payments_delivery_request_id_fkey'
);

insert into public.payouts (provider_id, booking_id, amount_kobo, created_at, updated_at)
select provider_id, id, 3048300, '2000-01-01', '2000-01-01'
from public.bookings
where code = 'CL-7K3Q9';

insert into public.ratings (booking_id, farmer_id, provider_id, stars, comment, created_at, updated_at)
select id, farmer_id, provider_id, 5, 'Kept my tomatoes fresh', '2000-01-01', '2000-01-01'
from public.bookings
where code = 'CL-7K3Q9';

insert into public.notifications (recipient_phone, channel, template, payload, created_at, updated_at)
values (
  '+2348098765432',
  'sms',
  'expiry_reminder',
  '{"booking_code": "CL-7K3Q9"}',
  '2000-01-01',
  '2000-01-01'
);

insert into public.action_tokens (
  token_hash, purpose, subject_id, expires_at, created_at, updated_at
)
select 'accept-hash', 'provider_accept_booking', id, now() + interval '12 hours', '2000-01-01',
  '2000-01-01'
from public.bookings
where code = 'CL-7K3Q9';

insert into public.search_logs (
  lat, lng, crop_id, quantity, duration_days, result_count, channel, created_at, updated_at
)
select 7.43, 3.91, id, 2, 30, 0, 'web', '2000-01-01', '2000-01-01'
from public.crops
where name = 'Tomatoes';

insert into public.booking_reminders (booking_id, kind, notification_id, created_at, updated_at)
select b.id, 'expiry_two_days_before', n.id, '2000-01-01', '2000-01-01'
from public.bookings b
cross join public.notifications n
where b.code = 'CL-7K3Q9';

do $$
declare
  b public.bookings;
  pay public.payments;
  po public.payouts;
  n public.notifications;
  t public.action_tokens;
  s public.search_logs;
  e public.booking_events;
begin
  select * into b from public.bookings where code = 'CL-7K3Q9';
  if b.id is null or b.delivery_fee_kobo <> 0 then
    raise exception 'bookings defaults are wrong: %', row_to_json(b);
  end if;

  if (select count(*) from public.bookings) <> 3 then
    raise exception 'expected 3 valid bookings';
  end if;

  select * into pay from public.payments where provider_ref = 'T-0002';
  if pay.status <> 'initiated' or pay.paid_at is not null then
    raise exception 'payments defaults are wrong: %', row_to_json(pay);
  end if;

  select * into po from public.payouts;
  if po.status <> 'owed' or po.paid_at is not null then
    raise exception 'payouts defaults are wrong: %', row_to_json(po);
  end if;

  select * into n from public.notifications;
  if n.status <> 'queued' or n.attempts <> 0 or n.user_id is not null or n.sent_at is not null then
    raise exception 'notifications defaults are wrong: %', row_to_json(n);
  end if;

  select * into t from public.action_tokens;
  if t.used_at is not null then
    raise exception 'action_tokens defaults are wrong: %', row_to_json(t);
  end if;

  select * into s from public.search_logs;
  if s.expanded_radius or s.user_id is not null then
    raise exception 'search_logs defaults are wrong: %', row_to_json(s);
  end if;

  select * into e from public.booking_events where from_status is null limit 1;
  if e.metadata <> '{}' or (select count(*) from public.booking_events) <> 4 then
    raise exception 'booking_events defaults are wrong: %', row_to_json(e);
  end if;

  if not exists (
    select
    from pg_index
    where indexrelid = 'public.bookings_provider_capacity_idx'::regclass and indpred is not null
  ) then
    raise exception 'bookings_provider_capacity_idx is not partial';
  end if;
end;
$$;

update public.bookings set notes = 'Bring crates' where code = 'CL-7K3Q9';
update public.payments set paystack_payload = '{"status": "success", "verified": true}'
where provider_ref = 'T-0001';
update public.payouts
set status = 'paid', paid_at = now(), reference = 'TRF-0001', recorded_by = (
  select id from public.users where phone = '+2348098765432'
);
update public.ratings set comment = 'Kept my tomatoes fresh for a month';
update public.notifications set status = 'sent', sent_at = now(), provider_message_id = 'msg-1',
  attempts = 1;
update public.action_tokens set used_at = now();
update public.search_logs set expanded_radius = true;
update public.booking_reminders set notification_id = notification_id;

do $$
declare
  stale text;
begin
  select string_agg(name, ', ') into stale
  from (
    select 'bookings' as name, created_at, updated_at from public.bookings where code = 'CL-7K3Q9'
    union all
    select 'payments', created_at, updated_at from public.payments where provider_ref = 'T-0001'
    union all
    select 'payouts', created_at, updated_at from public.payouts
    union all
    select 'ratings', created_at, updated_at from public.ratings
    union all
    select 'notifications', created_at, updated_at from public.notifications
    union all
    select 'action_tokens', created_at, updated_at from public.action_tokens
    union all
    select 'search_logs', created_at, updated_at from public.search_logs
    union all
    select 'booking_reminders', created_at, updated_at from public.booking_reminders
  ) as touched
  where updated_at <> now() or created_at <> '2000-01-01';

  if stale is not null then
    raise exception 'set_updated_at did not run, or changed created_at, on: %', stale;
  end if;
end;
$$;

-- Each case breaks exactly one rule, so the amounts it changes are kept consistent otherwise.
select pg_temp.expect_check_violation(
  format($$update public.bookings set %s where code = 'CL-7K3Q9'$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$status = 'paid'$$, 'bookings_status_valid'),
    ($$code = 'CL-7K3O9'$$, 'bookings_code_format'),
    ($$code = 'CL-7K309'$$, 'bookings_code_format'),
    ($$code = 'CL-7K3I9'$$, 'bookings_code_format'),
    ($$code = 'CL-7K319'$$, 'bookings_code_format'),
    ($$code = 'cl-7k3q9'$$, 'bookings_code_format'),
    ($$code = 'CL-7K3Q'$$, 'bookings_code_format'),
    ($$code = 'CL-7K3Q9A'$$, 'bookings_code_format'),
    ($$capacity_unit = 'litres'$$, 'bookings_capacity_unit_valid'),
    ($$end_date = '2026-12-01'$$, 'bookings_end_date_matches'),
    ($$cancelled_by = 'farmer'$$, 'bookings_cancelled_by_status'),
    ($$status = 'cancelled'$$, 'bookings_cancelled_by_status'),
    ($$status = 'cancelled', cancelled_by = 'driver'$$, 'bookings_cancelled_by_valid'),
    (
      'quantity = 0, storage_subtotal_kobo = 0, commission_kobo = 0, deposit_kobo = 0,
        balance_due_kobo = 0, total_charged_online_kobo = 0',
      'bookings_quantity_positive'
    ),
    (
      'duration_days = 0, end_date = start_date, storage_subtotal_kobo = 0, commission_kobo = 0,
        deposit_kobo = 0, balance_due_kobo = 0, total_charged_online_kobo = 0',
      'bookings_duration_days_min'
    ),
    (
      'unit_price_kobo = 0, storage_subtotal_kobo = 0, commission_kobo = 0, deposit_kobo = 0,
        balance_due_kobo = 0, total_charged_online_kobo = 0',
      'bookings_unit_price_kobo_positive'
    ),
    (
      'deposit_percent = 0.075, deposit_kobo = 1016100, balance_due_kobo = 12531900,
        total_charged_online_kobo = 1016100',
      'bookings_deposit_percent_above_commission_rate'
    ),
    (
      'deposit_percent = 1.1, deposit_kobo = 14902800, balance_due_kobo = -1354800,
        total_charged_online_kobo = 14902800',
      'bookings_deposit_percent_range'
    ),
    ('commission_rate = -0.1, commission_kobo = -1354800', 'bookings_commission_rate_range'),
    (
      'service_fee_kobo = -1, total_charged_online_kobo = 4064399',
      'bookings_service_fee_kobo_nonnegative'
    ),
    (
      'delivery_fee_kobo = -1, total_charged_online_kobo = 4064399',
      'bookings_delivery_fee_kobo_nonnegative'
    ),
    (
      'storage_subtotal_kobo = 13548001, balance_due_kobo = 9483601',
      'bookings_storage_subtotal_consistent'
    ),
    ('commission_kobo = 1016101', 'bookings_commission_consistent'),
    (
      'deposit_kobo = 4064401, balance_due_kobo = 9483599, total_charged_online_kobo = 4064401',
      'bookings_deposit_consistent'
    ),
    ('balance_due_kobo = 9483599', 'bookings_balance_due_consistent'),
    ('total_charged_online_kobo = 4064401', 'bookings_total_charged_online_consistent'),
    ('service_fee_kobo = 10000', 'bookings_total_charged_online_consistent'),
    ('delivery_fee_kobo = 50000', 'bookings_total_charged_online_consistent')
) as v(assignment, expected_constraint);

-- Rounding the subtotal half down (2,497.5 to 2,497) is refused.
select pg_temp.expect_check_violation(
  $$update public.bookings
    set storage_subtotal_kobo = 2497, deposit_kobo = 749, balance_due_kobo = 1748
    where code = 'CL-H4LF2'$$,
  'bookings_storage_subtotal_consistent'
);
select pg_temp.expect_check_violation(
  $$update public.bookings set commission_kobo = 14 where code = 'CL-RW8NX'$$,
  'bookings_commission_consistent'
);

-- What the rules allow: a cancelled booking with who cancelled it, a service fee and a delivery fee
-- added to the online charge.
update public.bookings
set status = 'cancelled', cancelled_by = 'farmer', service_fee_kobo = 10000,
  delivery_fee_kobo = 150000, total_charged_online_kobo = 4224400
where code = 'CL-7K3Q9';

select pg_temp.expect_unique_violation(
  $$insert into public.bookings (
      code, farmer_id, provider_id, crop_id, quantity, capacity_unit, start_date, duration_days,
      end_date, status, unit_price_kobo, storage_subtotal_kobo, commission_rate, commission_kobo,
      service_fee_kobo, deposit_percent, deposit_kobo, balance_due_kobo, delivery_fee_kobo,
      total_charged_online_kobo
    )
    select 'CL-7K3Q9', farmer_id, provider_id, crop_id, quantity, capacity_unit, start_date,
      duration_days, end_date, 'payment_pending', unit_price_kobo, storage_subtotal_kobo,
      commission_rate, commission_kobo, service_fee_kobo, deposit_percent, deposit_kobo,
      balance_due_kobo, delivery_fee_kobo, total_charged_online_kobo
    from public.bookings
    where code = 'CL-7K3Q9'$$,
  'bookings_code_key'
);

select pg_temp.expect_check_violation(
  format(
    $$insert into public.booking_events (booking_id, from_status, to_status, actor_type, metadata)
      select id, %s, %s, %s, %s from public.bookings where code = 'CL-7K3Q9'$$,
    v.from_status, v.to_status, v.actor_type, v.metadata
  ),
  v.expected_constraint
)
from (
  values
    ($$'confirmed'$$, $$'paid'$$, $$'system'$$, $$'{}'$$, 'booking_events_to_status_valid'),
    ($$'paid'$$, $$'confirmed'$$, $$'system'$$, $$'{}'$$, 'booking_events_from_status_valid'),
    ($$'confirmed'$$, $$'cancelled'$$, $$'user'$$, $$'{}'$$, 'booking_events_actor_type_valid'),
    ($$'confirmed'$$, $$'cancelled'$$, $$'farmer'$$, $$'[]'$$, 'booking_events_metadata_object')
) as v(from_status, to_status, actor_type, metadata, expected_constraint);

-- The audit log is append-only even for postgres, which owns the tables and bypasses RLS like the
-- service role the API uses.
do $$
declare
  change text;
begin
  if current_user <> 'postgres' then
    raise exception 'the append-only check must run as postgres, not %', current_user;
  end if;

  foreach change in array array[
    $sql$update public.booking_events set metadata = '{"edited": true}'$sql$,
    'delete from public.booking_events',
    'truncate public.booking_events'
  ] loop
    begin
      execute change;
      raise exception 'booking_events allowed: %', change;
    exception
      when restrict_violation then
        null;
    end;
  end loop;

  if (select count(*) from public.booking_events) <> 4 then
    raise exception 'booking_events rows changed';
  end if;
end;
$$;

-- A booking with events cannot be deleted, so its history cannot go either.
select pg_temp.expect_foreign_key_violation(
  $$delete from public.bookings where code = 'CL-RW8NX'$$,
  'booking_events_booking_id_fkey'
);

select pg_temp.expect_check_violation(
  format($$update public.payments set %s where provider_ref = 'T-0002'$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$purpose = 'deposit'$$, 'payments_purpose_valid'),
    ($$status = 'pending'$$, 'payments_status_valid'),
    ('amount_kobo = 0', 'payments_amount_kobo_positive'),
    ('paid_at = now()', 'payments_paid_at_status'),
    ($$status = 'success'$$, 'payments_paid_at_status'),
    ($$status = 'refunded'$$, 'payments_paid_at_status'),
    ($$purpose = 'delivery_fee'$$, 'payments_delivery_request_purpose'),
    ('delivery_request_id = gen_random_uuid()', 'payments_delivery_request_purpose')
) as v(assignment, expected_constraint);

select pg_temp.expect_check_violation(
  $$update public.payments set status = 'failed' where provider_ref = 'T-0001'$$,
  'payments_paid_at_status'
);

select pg_temp.expect_unique_violation(
  $$insert into public.payments (booking_id, provider_ref, purpose, amount_kobo)
    select booking_id, 'T-0001', 'refund', 100 from public.payments where provider_ref = 'T-0001'$$,
  'payments_provider_ref_key'
);

select pg_temp.expect_check_violation(
  format($$update public.payouts set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$status = 'settled', paid_at = null, reference = null, recorded_by = null$$,
      'payouts_status_valid'),
    ('amount_kobo = 0', 'payouts_amount_kobo_positive'),
    ('reference = null', 'payouts_paid_fields'),
    ('paid_at = null', 'payouts_paid_fields'),
    ('recorded_by = null', 'payouts_paid_fields'),
    ($$status = 'owed'$$, 'payouts_paid_fields')
) as v(assignment, expected_constraint);

select pg_temp.expect_unique_violation(
  $$insert into public.payouts (provider_id, booking_id, amount_kobo)
    select provider_id, booking_id, amount_kobo from public.payouts$$,
  'payouts_booking_id_key'
);

select pg_temp.expect_check_violation($$update public.ratings set stars = 0$$, 'ratings_stars_range');
select pg_temp.expect_check_violation($$update public.ratings set stars = 6$$, 'ratings_stars_range');
select pg_temp.expect_unique_violation(
  $$insert into public.ratings (booking_id, farmer_id, provider_id, stars)
    select booking_id, farmer_id, provider_id, 1 from public.ratings$$,
  'ratings_booking_id_key'
);

select pg_temp.expect_check_violation(
  format($$update public.notifications set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$recipient_phone = '08098765432'$$, 'notifications_recipient_phone_format'),
    ($$channel = 'web'$$, 'notifications_channel_valid'),
    ($$template = 'Expiry Reminder'$$, 'notifications_template_format'),
    ($$payload = '[]'$$, 'notifications_payload_object'),
    ($$status = 'delivered', sent_at = null$$, 'notifications_status_valid'),
    ('attempts = -1', 'notifications_attempts_nonnegative'),
    ('sent_at = null', 'notifications_sent_at_status'),
    ($$status = 'failed'$$, 'notifications_sent_at_status'),
    ($$status = 'queued'$$, 'notifications_sent_at_status')
) as v(assignment, expected_constraint);

select pg_temp.expect_check_violation(
  format($$update public.action_tokens set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$purpose = 'login'$$, 'action_tokens_purpose_valid'),
    ($$used_at = expires_at + interval '1 second'$$, 'action_tokens_used_before_expiry')
) as v(assignment, expected_constraint);

select pg_temp.expect_unique_violation(
  $$insert into public.action_tokens (token_hash, purpose, subject_id, expires_at)
    select token_hash, 'provider_reject_booking', subject_id, expires_at from public.action_tokens$$,
  'action_tokens_token_hash_key'
);

select pg_temp.expect_check_violation(
  format($$update public.search_logs set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ('lat = 91', 'search_logs_lat_range'),
    ('lng = -181', 'search_logs_lng_range'),
    ('quantity = 0', 'search_logs_quantity_positive'),
    ('duration_days = 0', 'search_logs_duration_days_min'),
    ('result_count = -1', 'search_logs_result_count_nonnegative'),
    ($$channel = 'ussd'$$, 'search_logs_channel_valid')
) as v(assignment, expected_constraint);

select pg_temp.expect_check_violation(
  $$update public.booking_reminders set kind = 'expiry_reminder'$$,
  'booking_reminders_kind_valid'
);

-- The reminder job's insert-or-skip: a second insert of the same kind does nothing, and a plain
-- insert is refused.
do $$
declare
  inserted integer;
begin
  insert into public.booking_reminders (booking_id, kind)
  select booking_id, kind from public.booking_reminders
  on conflict (booking_id, kind) do nothing;
  get diagnostics inserted = row_count;

  if inserted <> 0 then
    raise exception 'booking_reminders sent a reminder twice';
  end if;
end;
$$;

select pg_temp.expect_unique_violation(
  $$insert into public.booking_reminders (booking_id, kind)
    select booking_id, kind from public.booking_reminders$$,
  'booking_reminders_booking_id_kind_key'
);

-- Another kind for the same booking is a different reminder.
insert into public.booking_reminders (booking_id, kind)
select booking_id, 'collection_due' from public.booking_reminders;

-- Delivery and the presale data layer. The listing is the draft a farmer creates by opting in to
-- presale on the worked-example booking (PRD 7.10). Its created_at is 23:30 UTC on Sunday 1 November,
-- which is already Monday 2 November in Lagos.
insert into public.produce_listings (
  farmer_id, provider_id, booking_id, crop_id, title, quantity, unit, unit_price_kobo,
  available_quantity, available_from, created_at, updated_at
)
select farmer_id, provider_id, id, crop_id, 'Fresh tomatoes', 40, 'crate', 1500000, 40, end_date,
  '2026-11-01 23:30:00+00', '2026-11-01 23:30:00+00'
from public.bookings
where code = 'CL-7K3Q9';

-- A 20% deposit on 10 crates at ₦15,000.
insert into public.listing_reservations (
  listing_id, buyer_name, buyer_phone, quantity, total_kobo, deposit_kobo, status, created_at,
  updated_at
)
select id, 'Funke Adeyemi', '+2348055555555', 10, 15000000, 3000000, 'payment_pending',
  '2000-01-01', '2000-01-01'
from public.produce_listings;

do $$
declare
  dp public.delivery_partners;
  l public.produce_listings;
  r public.listing_reservations;
  observation record;
begin
  select * into dp from public.delivery_partners;
  if not dp.is_active or dp.avg_rating <> 0 or dp.coverage_lgas <> '{}' then
    raise exception 'delivery_partners defaults are wrong: %', row_to_json(dp);
  end if;

  select * into l from public.produce_listings;
  if l.status <> 'draft' then
    raise exception 'produce_listings defaults are wrong: %', row_to_json(l);
  end if;

  select * into r from public.listing_reservations;
  if r.deposit_percent <> 0.20 then
    raise exception 'listing_reservations defaults are wrong: %', row_to_json(r);
  end if;

  if (select count(*) from public.v_listing_price_observations) <> 1 then
    raise exception 'v_listing_price_observations does not return exactly the one listing';
  end if;

  select * into observation from public.v_listing_price_observations;
  if observation.crop_id <> l.crop_id
    or observation.week <> '2026-11-02'
    or observation.unit_price_kobo <> 1500000
    or observation.unit <> 'crate'
  then
    raise exception 'v_listing_price_observations returned the wrong observation: %',
      row_to_json(observation);
  end if;
end;
$$;

update public.delivery_partners set coverage_lgas = '{Akinyele,"Ibadan North"}';
update public.delivery_requests set notes = 'Call on arrival';
update public.produce_listings set title = 'Fresh Roma tomatoes';
update public.listing_reservations set buyer_name = 'Funke Adeyemi-Bello';

do $$
declare
  stale text;
begin
  select string_agg(name, ', ') into stale
  from (
    select 'delivery_partners' as name, created_at, updated_at, '2000-01-01'::timestamptz as expected
    from public.delivery_partners
    union all
    select 'delivery_requests', created_at, updated_at, '2000-01-01' from public.delivery_requests
    union all
    select 'produce_listings', created_at, updated_at, '2026-11-01 23:30:00+00'
    from public.produce_listings
    union all
    select 'listing_reservations', created_at, updated_at, '2000-01-01'
    from public.listing_reservations
  ) as touched
  where updated_at <> now() or created_at <> expected;

  if stale is not null then
    raise exception 'set_updated_at did not run, or changed created_at, on: %', stale;
  end if;
end;
$$;

select pg_temp.expect_check_violation(
  format($$update public.delivery_partners set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$phone = '08030000001'$$, 'delivery_partners_phone_format'),
    ($$vehicle_types = '{}'$$, 'delivery_partners_vehicle_types_valid'),
    ($$vehicle_types = '{bike,car}'$$, 'delivery_partners_vehicle_types_valid'),
    ($$vehicle_types = '{bike,NULL}'$$, 'delivery_partners_vehicle_types_valid'),
    ($$coverage_lgas = '{Akinyele,NULL}'$$, 'delivery_partners_coverage_lgas_no_nulls'),
    ('avg_rating = 5.01', 'delivery_partners_avg_rating_range'),
    ('avg_rating = -1', 'delivery_partners_avg_rating_range')
) as v(assignment, expected_constraint);

select pg_temp.expect_unique_violation(
  $$insert into public.delivery_partners (user_id, company_name, phone, vehicle_types)
    select user_id, 'Second company', phone, vehicle_types from public.delivery_partners$$,
  'delivery_partners_user_id_key'
);

select pg_temp.expect_foreign_key_violation(
  $$delete from public.users where phone = '+2348030000001'$$,
  'delivery_partners_user_id_fkey'
);

-- The request is still requested, with no partner. Each case breaks exactly one rule.
select pg_temp.expect_check_violation(
  format($$update public.delivery_requests set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$status = 'in_transit'$$, 'delivery_requests_status_valid'),
    ($$vehicle_type = 'car'$$, 'delivery_requests_vehicle_type_valid'),
    ($$context_type = 'booking'$$, 'delivery_requests_context_type_valid'),
    ($$contact_phone = '08098765432'$$, 'delivery_requests_contact_phone_format'),
    ('load_quantity = 0', 'delivery_requests_load_quantity_positive'),
    ('distance_km = -1', 'delivery_requests_distance_km_nonnegative'),
    (
      'fee_kobo = 0, partner_payout_kobo = 0, platform_margin_kobo = 0',
      'delivery_requests_fee_kobo_positive'
    ),
    (
      'partner_payout_kobo = -1, platform_margin_kobo = 100001',
      'delivery_requests_partner_payout_kobo_nonnegative'
    ),
    (
      'partner_payout_kobo = 100001, platform_margin_kobo = -1',
      'delivery_requests_platform_margin_kobo_nonnegative'
    ),
    ('partner_payout_kobo = 80001', 'delivery_requests_fee_split_consistent'),
    ('fee_kobo = 100001', 'delivery_requests_fee_split_consistent'),
    ($$handover_code = '042'$$, 'delivery_requests_handover_code_format'),
    ($$handover_code = '04270'$$, 'delivery_requests_handover_code_format'),
    ($$handover_code = '04a7'$$, 'delivery_requests_handover_code_format'),
    ($$status = 'assigned'$$, 'delivery_requests_partner_id_status'),
    (
      'partner_id = (select id from public.delivery_partners), assigned_at = now()',
      'delivery_requests_partner_id_status'
    ),
    ('assigned_at = now()', 'delivery_requests_assigned_at_partner_id'),
    ('picked_up_at = now()', 'delivery_requests_picked_up_at_status'),
    ('delivered_at = now()', 'delivery_requests_delivered_at_status')
) as v(assignment, expected_constraint);

-- What the rules allow: a request cancelled before a partner was assigned.
update public.delivery_requests set status = 'cancelled';
update public.delivery_requests set status = 'requested';

update public.delivery_requests
set status = 'assigned', partner_id = (select id from public.delivery_partners), assigned_at = now();

select pg_temp.expect_check_violation(
  format($$update public.delivery_requests set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ('partner_id = null, assigned_at = null', 'delivery_requests_partner_id_status'),
    ('assigned_at = null', 'delivery_requests_assigned_at_partner_id'),
    ($$status = 'picked_up'$$, 'delivery_requests_picked_up_at_status'),
    ($$status = 'delivered', picked_up_at = now()$$, 'delivery_requests_delivered_at_status')
) as v(assignment, expected_constraint);

update public.delivery_requests set status = 'accepted';
update public.delivery_requests set status = 'picked_up', picked_up_at = now();
update public.delivery_requests set status = 'delivered', delivered_at = now();

select pg_temp.expect_check_violation(
  $$update public.delivery_requests set picked_up_at = null$$,
  'delivery_requests_picked_up_at_status'
);

-- A delivery that has been paid for cannot be deleted.
select pg_temp.expect_foreign_key_violation(
  'delete from public.delivery_requests',
  'payments_delivery_request_id_fkey'
);

select pg_temp.expect_check_violation(
  format($$update public.produce_listings set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$status = 'published'$$, 'produce_listings_status_valid'),
    ('quantity = 0, available_quantity = 0', 'produce_listings_quantity_positive'),
    ('unit_price_kobo = 0', 'produce_listings_unit_price_kobo_positive'),
    ('available_quantity = 41', 'produce_listings_available_quantity_range'),
    ('available_quantity = -1', 'produce_listings_available_quantity_range')
) as v(assignment, expected_constraint);

-- The limits themselves are allowed: none left, or all of it.
update public.produce_listings set available_quantity = 0, status = 'sold_out';
update public.produce_listings set available_quantity = quantity, status = 'draft';

select pg_temp.expect_unique_violation(
  $$insert into public.produce_listings (
      farmer_id, provider_id, booking_id, crop_id, title, quantity, unit, unit_price_kobo,
      available_quantity, available_from
    )
    select farmer_id, provider_id, booking_id, crop_id, title, quantity, unit, unit_price_kobo,
      available_quantity, available_from
    from public.produce_listings$$,
  'produce_listings_booking_id_key'
);

select pg_temp.expect_foreign_key_violation(
  'delete from public.produce_listings',
  'listing_reservations_listing_id_fkey'
);

select pg_temp.expect_check_violation(
  format($$update public.listing_reservations set %s$$, v.assignment),
  v.expected_constraint
)
from (
  values
    ($$status = 'collected'$$, 'listing_reservations_status_valid'),
    ($$buyer_phone = '08055555555'$$, 'listing_reservations_buyer_phone_format'),
    ('quantity = 0', 'listing_reservations_quantity_positive'),
    ('total_kobo = 0, deposit_kobo = 0', 'listing_reservations_total_kobo_positive'),
    ('deposit_percent = 0, deposit_kobo = 0', 'listing_reservations_deposit_percent_range'),
    (
      'deposit_percent = 1.1, deposit_kobo = 16500000',
      'listing_reservations_deposit_percent_range'
    ),
    ('deposit_kobo = 3000001', 'listing_reservations_deposit_consistent'),
    ('deposit_percent = 0.25', 'listing_reservations_deposit_consistent')
) as v(assignment, expected_constraint);

-- Rounding is half up: 20% of 15,000,003 is 3,000,000.6, so the deposit is 3,000,001, not 3,000,000.
select pg_temp.expect_check_violation(
  'update public.listing_reservations set total_kobo = 15000003',
  'listing_reservations_deposit_consistent'
);
update public.listing_reservations set total_kobo = 15000003, deposit_kobo = 3000001;

-- A deposit of the whole total is allowed.
update public.listing_reservations set deposit_percent = 1, deposit_kobo = total_kobo;

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
    ('select * from public.bookings'),
    ('select * from public.booking_events'),
    ('select * from public.payments'),
    ('select * from public.payouts'),
    ('select * from public.ratings'),
    ('select * from public.notifications'),
    ('select * from public.action_tokens'),
    ('select * from public.search_logs'),
    ('select * from public.booking_reminders'),
    ('select * from public.delivery_partners'),
    ('select * from public.delivery_requests'),
    ('select * from public.produce_listings'),
    ('select * from public.listing_reservations'),
    ('select * from public.v_listing_price_observations'),
    ('update public.produce_listings set title = title'),
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

-- The same for the price view: with security_invoker, a reader granted the view still meets RLS on
-- produce_listings, so the draft listing stays hidden. A view running as its owner would show it.
grant select on public.produce_listings, public.v_listing_price_observations to authenticated;

do $$
declare
  visible bigint;
begin
  set local role authenticated;

  select (select count(*) from public.produce_listings)
    + (select count(*) from public.v_listing_price_observations)
  into visible;

  reset role;

  if visible <> 0 then
    raise exception 'RLS let authenticated see % listings or price observations', visible;
  end if;

  if (select count(*) from public.v_listing_price_observations) <> 1 then
    raise exception 'v_listing_price_observations lost its row for postgres';
  end if;
end;
$$;

rollback;

\echo 'Schema checks passed'
