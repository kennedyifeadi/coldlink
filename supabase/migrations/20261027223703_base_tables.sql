-- Users, OTP codes and app config (PRD 5.1, 5.2, 5.15). Role and channel values match
-- packages/shared/src/enums.ts.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique
    constraint users_phone_format check (phone ~ '^\+234[0-9]{10}$'),
  coldlink_id text not null unique
    constraint users_coldlink_id_format check (coldlink_id ~ '^[0-9]{7}$'),
  full_name text,
  roles text[] not null default '{farmer}'
    constraint users_roles_valid check (
      cardinality(roles) > 0
      and array_position(roles, null) is null
      and roles <@ array['farmer', 'provider', 'delivery_partner', 'admin']
    ),
  preferred_channel text not null default 'web'
    constraint users_preferred_channel_valid check (preferred_channel in ('web', 'whatsapp', 'sms')),
  home_lga text,
  home_lat double precision
    constraint users_home_lat_range check (home_lat between -90 and 90),
  home_lng double precision
    constraint users_home_lng_range check (home_lng between -180 and 180),
  consented_at timestamptz,
  last_login_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_home_location_pair check ((home_lat is null) = (home_lng is null))
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- No foreign key to users: a code is sent before the user exists (first registration).
create table public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null
    constraint otp_codes_phone_format check (phone ~ '^\+234[0-9]{10}$'),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
    constraint otp_codes_attempts_range check (attempts between 0 and 5),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index otp_codes_phone_unconsumed_idx
  on public.otp_codes (phone, created_at desc)
  where consumed_at is null;

create trigger otp_codes_set_updated_at
  before update on public.otp_codes
  for each row execute function public.set_updated_at();

-- Keyed by name rather than a uuid id: the API reads values by key (PRD 5.15).
create table public.app_config (
  key text primary key
    constraint app_config_key_format check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();
