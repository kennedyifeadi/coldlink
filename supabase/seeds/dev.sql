-- Development sample data: nine storage providers around Ibadan and their owners (PRD 13). Every
-- row is fake and marked as sample data; none of it may reach staging or production. Run it only
-- with `pnpm db:seed:dev`, which applies it to the dev project in one transaction (decision 41).
--
-- Safe to run again: owners are matched by phone, and a sample owner who already has a provider
-- gets no second one. Nothing here is updated or deleted, so edits made in dev are kept.

do $$
begin
  if current_setting('coldlink.seed_target', true) is distinct from 'dev' then
    raise exception 'supabase/seeds/dev.sql is development sample data. Run it with pnpm db:seed:dev.';
  end if;
end;
$$;

-- +234 800 is Nigeria's toll-free range, not a mobile prefix, so these numbers reach no one.
create temporary table dev_sample_providers (
  owner_phone text primary key,
  owner_coldlink_id text not null,
  area text not null,
  display_name text not null,
  facility_type text not null,
  lga text not null,
  lat double precision not null,
  lng double precision not null,
  capacity_total numeric not null,
  capacity_unit text not null,
  price_per_unit_per_day_kobo bigint not null,
  min_storage_days integer not null,
  has_backup_power text not null,
  verification_status text not null,
  category_slugs text[] not null
) on commit drop;

insert into dev_sample_providers
values
  ('+2348000000001', '9000001', 'Bodija', 'Bodija Cold Room (Sample)', 'cold_room',
    'Ibadan North', 7.4335, 3.9124, 60, 'sqm', 225800, 3, 'generator', 'approved',
    '{vegetables,fruits,tubers}'),
  ('+2348000000002', '9000002', 'Oje', 'Oje Market Freezers (Sample)', 'chest_freezer',
    'Ibadan North East', 7.3920, 3.9140, 300, 'kg', 5000, 1, 'solar', 'approved',
    '{fish,meat_poultry}'),
  ('+2348000000003', '9000003', 'Dugbe', 'Dugbe Fridge Fleet (Sample)', 'fridge_fleet',
    'Ibadan North West', 7.3870, 3.8870, 40, 'crates', 50000, 1, 'generator', 'approved',
    '{vegetables,fruits,dairy}'),
  ('+2348000000004', '9000004', 'Apata', 'Apata Cold Store (Sample)', 'cold_room',
    'Ibadan South West', 7.3735, 3.8455, 200, 'crates', 40000, 7, 'generator', 'approved',
    '{vegetables,fruits,tubers,other}'),
  ('+2348000000005', '9000005', 'Iwo Road', 'Iwo Road Cold Room (Sample)', 'cold_room',
    'Ibadan North East', 7.4070, 3.9345, 40, 'sqm', 200000, 2, 'solar', 'approved',
    '{fish,meat_poultry,dairy}'),
  ('+2348000000006', '9000006', 'Moniya', 'Moniya Produce Cold Room (Sample)', 'cold_room',
    'Akinyele', 7.5250, 3.9110, 150, 'crates', 35000, 1, 'none', 'approved',
    '{vegetables,fruits}'),
  ('+2348000000007', '9000007', 'Sango', 'Sango Spare Fridge (Sample)', 'fridge',
    'Ibadan North', 7.4250, 3.8930, 80, 'kg', 6000, 1, 'unknown', 'approved',
    '{vegetables,fruits,dairy}'),
  ('+2348000000008', '9000008', 'Ojoo', 'Ojoo Chest Freezer (Sample)', 'chest_freezer',
    'Akinyele', 7.4660, 3.9120, 200, 'kg', 4500, 1, 'none', 'pending',
    '{fish,meat_poultry}'),
  ('+2348000000009', '9000009', 'Challenge', 'Challenge Storage (Sample)', 'other',
    'Ibadan South West', 7.3520, 3.8790, 30, 'crates', 45000, 1, 'unknown', 'suspended',
    '{vegetables}');

insert into public.users (phone, coldlink_id, full_name, roles)
select owner_phone, owner_coldlink_id, 'Sample Owner, ' || area || ' (dev data)', '{provider}'
from dev_sample_providers
on conflict (phone) do nothing;

-- Categories are added only with a new provider, so ones removed in dev since are not put back.
-- ST_MakePoint takes longitude first.
with new_providers as (
  insert into public.providers (
    owner_user_id, display_name, facility_type, description, phone, address_text, lga, location,
    capacity_total, capacity_unit, price_per_unit_per_day_kobo, min_storage_days, has_backup_power,
    verification_status, verified_at
  )
  select
    u.id,
    s.display_name,
    s.facility_type,
    'Development sample data, not a real storage provider.',
    s.owner_phone,
    s.area || ', Ibadan (sample address)',
    s.lga,
    extensions.st_setsrid(extensions.st_makepoint(s.lng, s.lat), 4326)::extensions.geography,
    s.capacity_total,
    s.capacity_unit,
    s.price_per_unit_per_day_kobo,
    s.min_storage_days,
    s.has_backup_power,
    s.verification_status,
    case when s.verification_status = 'approved' then now() end
  from dev_sample_providers s
  join public.users u on u.phone = s.owner_phone
  where not exists (select from public.providers p where p.owner_user_id = u.id)
  returning id, phone
)
insert into public.provider_crop_support (provider_id, category_id)
select p.id, c.id
from new_providers p
join dev_sample_providers s on s.owner_phone = p.phone
join public.crop_categories c on c.slug = any (s.category_slugs);
