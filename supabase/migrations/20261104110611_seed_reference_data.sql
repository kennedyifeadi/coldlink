-- Reference data every environment needs (PRD 5.4, 5.15, 13): crop categories, crops and the
-- app_config placeholders. It is a migration, not seed.sql, so db push delivers it to dev, staging
-- and production alike (decision 40). Every insert skips rows that already exist by their natural
-- key, so running it again changes nothing and never overwrites a value an admin has since changed.

insert into public.crop_categories (slug, name)
values
  ('vegetables', 'Vegetables'),
  ('fruits', 'Fruits'),
  ('tubers', 'Tubers'),
  ('fish', 'Fish'),
  ('meat_poultry', 'Meat and poultry'),
  ('dairy', 'Dairy'),
  ('other', 'Other')
on conflict (slug) do nothing;

-- The PRD 13 list, plus onions (DU-1) and one generic "Other ..." crop per category, so a farmer can
-- book produce outside the list (DU-2, OQ-5). Shelf life and temperatures stay null until there is
-- a reliable source for them.
insert into public.crops (category_id, name, local_names)
select c.id, v.name, v.local_names
from (
  values
    ('vegetables', 'Tomatoes', '{}'::text[]),
    ('vegetables', 'Peppers', '{tatashe,rodo,shombo}'),
    ('vegetables', 'Leafy vegetables', '{ugu,efo,amaranth}'),
    ('vegetables', 'Okra', '{ila}'),
    ('vegetables', 'Onions', '{alubosa}'),
    ('vegetables', 'Cabbage', '{}'),
    ('vegetables', 'Carrots', '{}'),
    ('vegetables', 'Other vegetables', '{}'),
    ('fruits', 'Oranges', '{osan}'),
    ('fruits', 'Pineapples', '{ope oyinbo}'),
    ('fruits', 'Watermelon', '{}'),
    ('fruits', 'Plantains', '{agbagba}'),
    ('fruits', 'Other fruits', '{}'),
    ('tubers', 'Yam', '{isu}'),
    ('tubers', 'Cassava', '{ege,gbaguda}'),
    ('tubers', 'Other tubers', '{}'),
    ('fish', 'Fresh fish', '{eja}'),
    ('fish', 'Other fish', '{}'),
    ('meat_poultry', 'Chicken', '{adiye}'),
    ('meat_poultry', 'Other meat and poultry', '{}'),
    ('dairy', 'Other dairy', '{}'),
    ('other', 'Other produce', '{}')
) as v(category_slug, name, local_names)
join public.crop_categories c on c.slug = v.category_slug
on conflict (category_id, name) do nothing;

-- Exactly the PRD 5.15 placeholders, never invented values (PRD 0.2). Money is in kobo, rates are
-- fractions. The owner has not confirmed the deposit (OQ-1), the service fee (OQ-2), the delivery
-- fees (OQ-3) or the PRD 14 defaults; settling them is a config update, not a migration.
insert into public.app_config (key, value, description)
values
  ('commission_rate', '0.075',
    'Platform commission as a fraction of the storage subtotal, deducted from the provider''s side.'),
  ('service_fee_kobo', '0',
    'Flat service fee the farmer pays on top, in kobo. Unconfirmed placeholder (PRD 5.15).'),
  ('deposit_percent', '0.30',
    'Share of the storage subtotal paid online at booking; must be greater than commission_rate. '
    'Unconfirmed placeholder (PRD 5.15).'),
  ('provider_response_minutes', '120',
    'Minutes a provider has to accept or reject a booking. Unconfirmed placeholder (PRD 5.15).'),
  ('payment_hold_minutes', '15',
    'Minutes capacity is held while a booking awaits payment.'),
  ('search_default_radius_km', '25',
    'Default search radius in km.'),
  ('search_max_radius_km', '100',
    'Maximum search radius in km, used when a search at the default radius finds nothing.'),
  ('delivery_base_fee_kobo', '100000',
    'Delivery base fee in kobo. Unconfirmed placeholder (PRD 5.15).'),
  ('delivery_per_km_kobo', '10000',
    'Delivery fee per estimated road km, in kobo. Unconfirmed placeholder (PRD 5.15).'),
  ('delivery_min_fee_kobo', '100000',
    'Minimum delivery fee in kobo. Unconfirmed placeholder (PRD 5.15).'),
  ('delivery_partner_share', '0.80',
    'Share of the delivery fee paid to the delivery partner. Unconfirmed placeholder (PRD 5.15).'),
  ('road_distance_factor', '1.3',
    'Multiplier from straight-line distance to estimated road distance.'),
  ('require_provider_approval', 'true',
    'Whether providers need admin approval before appearing in search. '
    'Unconfirmed placeholder (PRD 5.15).'),
  ('otp_required', 'true',
    'Whether an OTP is required at registration and login. Unconfirmed placeholder (PRD 5.15).'),
  ('farmer_free_cancel_hours', '24',
    'Hours before the start date until which a farmer can cancel and get the deposit back. '
    'Unconfirmed placeholder (PRD 5.15).')
on conflict (key) do nothing;
