-- Outbound message log (PRD 5.12), single-use link tokens (PRD 5.13) and search logs (PRD 5.14).
-- Enum-like values match packages/shared/src/enums.ts.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users on delete set null,
  -- Where the message actually went. A user's own number is not always it: provider bookings go to
  -- providers.phone, delivery jobs to the partner's phone, and an OTP at registration goes out
  -- before the user exists.
  recipient_phone text not null
    constraint notifications_recipient_phone_format check (recipient_phone ~ '^\+234[0-9]{10}$'),
  channel text not null
    constraint notifications_channel_valid check (channel in ('sms', 'whatsapp')),
  template text not null
    constraint notifications_template_format check (template ~ '^[a-z][a-z0-9_]*$'),
  -- Never put an OTP code here: otp_codes stores only its hash.
  payload jsonb not null default '{}'
    constraint notifications_payload_object check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued'
    constraint notifications_status_valid check (status in ('queued', 'sent', 'failed')),
  attempts integer not null default 0
    constraint notifications_attempts_nonnegative check (attempts >= 0),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_sent_at_status check ((sent_at is not null) = (status = 'sent'))
);

-- The retry job picks up queued messages oldest first.
create index notifications_status_created_at_idx on public.notifications (status, created_at);
create index notifications_user_id_idx on public.notifications (user_id);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

create table public.action_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose text not null
    constraint action_tokens_purpose_valid check (
      purpose in (
        'provider_accept_booking',
        'provider_reject_booking',
        'delivery_accept',
        'delivery_update'
      )
    ),
  -- The booking or delivery request the token acts on; which one depends on purpose.
  subject_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_tokens_used_before_expiry check (used_at <= expires_at)
);

create index action_tokens_expires_at_idx on public.action_tokens (expires_at);
-- Using an accept link voids the matching reject link, so tokens are looked up by subject too.
create index action_tokens_subject_id_idx on public.action_tokens (subject_id);

create trigger action_tokens_set_updated_at
  before update on public.action_tokens
  for each row execute function public.set_updated_at();

create table public.search_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users on delete set null,
  lat double precision not null
    constraint search_logs_lat_range check (lat between -90 and 90),
  lng double precision not null
    constraint search_logs_lng_range check (lng between -180 and 180),
  crop_id uuid not null references public.crops on delete restrict,
  quantity numeric not null
    constraint search_logs_quantity_positive check (quantity > 0),
  duration_days integer not null
    constraint search_logs_duration_days_min check (duration_days >= 1),
  result_count integer not null
    constraint search_logs_result_count_nonnegative check (result_count >= 0),
  -- True when nothing was found in the default radius and the search was retried at the maximum
  -- (PRD 6.8). That is unmet demand near the farmer even when the retry found something.
  expanded_radius boolean not null default false,
  channel text not null
    constraint search_logs_channel_valid check (channel in ('web', 'whatsapp', 'sms')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index search_logs_created_at_idx on public.search_logs (created_at);
create index search_logs_user_id_idx on public.search_logs (user_id);

create trigger search_logs_set_updated_at
  before update on public.search_logs
  for each row execute function public.set_updated_at();
