-- Payments through Paystack (PRD 5.7) and what ColdLink owes providers (PRD 5.8). Enum-like values
-- match packages/shared/src/enums.ts.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings on delete restrict,
  -- Set for a delivery paid after booking (PRD 7.7 step 3). delivery_requests arrives in a later
  -- migration, which adds the foreign key and its index.
  delivery_request_id uuid,
  provider_ref text not null unique,
  purpose text not null
    constraint payments_purpose_valid check (
      purpose in ('booking_deposit', 'delivery_fee', 'refund')
    ),
  amount_kobo bigint not null
    constraint payments_amount_kobo_positive check (amount_kobo > 0),
  status text not null default 'initiated'
    constraint payments_status_valid check (
      status in ('initiated', 'success', 'failed', 'refunded', 'partially_refunded')
    ),
  paystack_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_paid_at_status check (
    (paid_at is not null) = (status in ('success', 'refunded', 'partially_refunded'))
  ),
  -- A delivery fee belongs to its delivery; a booking deposit is the booking's own charge, which
  -- already includes any delivery requested at booking. A refund may be for either.
  constraint payments_delivery_request_purpose check (
    case purpose
      when 'delivery_fee' then delivery_request_id is not null
      when 'booking_deposit' then delivery_request_id is null
      else true
    end
  )
);

create index payments_booking_id_idx on public.payments (booking_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers on delete restrict,
  -- One payout per booking, created when it is checked in (PRD 6.4).
  booking_id uuid not null unique references public.bookings on delete restrict,
  amount_kobo bigint not null
    constraint payouts_amount_kobo_positive check (amount_kobo > 0),
  status text not null default 'owed'
    constraint payouts_status_valid check (status in ('owed', 'paid')),
  paid_at timestamptz,
  reference text,
  recorded_by uuid references public.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_paid_fields check (
    case status
      when 'paid' then paid_at is not null and reference is not null and recorded_by is not null
      else paid_at is null and reference is null and recorded_by is null
    end
  )
);

create index payouts_provider_id_status_idx on public.payouts (provider_id, status);
create index payouts_status_created_at_idx on public.payouts (status, created_at);

create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();
