-- Bookings (PRD 5.5). Enum-like values match packages/shared/src/enums.ts. The status check allows
-- every shared status; which transitions are legal is the state machine's job (PRD 6.5).
--
-- The price columns are a snapshot taken at booking time, and the consistency checks below repeat
-- the pricing rules of decision 17 so a snapshot that disagrees with the pricing module cannot be
-- stored. Postgres round(numeric) rounds half away from zero, which is half up for these
-- non-negative amounts, as in packages/shared/src/pricing.ts.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  -- CL- and 5 characters from an alphabet without 0, O, 1 and I, which are easy to misread.
  code text not null unique
    constraint bookings_code_format check (code ~ '^CL-[A-HJ-NP-Z2-9]{5}$'),
  farmer_id uuid not null references public.users on delete restrict,
  provider_id uuid not null references public.providers on delete restrict,
  crop_id uuid not null references public.crops on delete restrict,
  quantity numeric not null
    constraint bookings_quantity_positive check (quantity > 0),
  capacity_unit text not null
    constraint bookings_capacity_unit_valid check (capacity_unit in ('sqm', 'crates', 'kg')),
  start_date date not null,
  duration_days integer not null
    constraint bookings_duration_days_min check (duration_days >= 1),
  end_date date not null,
  status text not null
    constraint bookings_status_valid check (
      status in (
        'payment_pending',
        'pending_provider',
        'confirmed',
        'rejected',
        'expired',
        'in_storage',
        'cancelled',
        'no_show',
        'completed'
      )
    ),
  unit_price_kobo bigint not null
    constraint bookings_unit_price_kobo_positive check (unit_price_kobo > 0),
  storage_subtotal_kobo bigint not null,
  commission_rate numeric not null
    constraint bookings_commission_rate_range check (commission_rate between 0 and 1),
  commission_kobo bigint not null,
  service_fee_kobo bigint not null
    constraint bookings_service_fee_kobo_nonnegative check (service_fee_kobo >= 0),
  deposit_percent numeric not null
    constraint bookings_deposit_percent_range check (deposit_percent between 0 and 1),
  deposit_kobo bigint not null,
  balance_due_kobo bigint not null,
  delivery_fee_kobo bigint not null default 0
    constraint bookings_delivery_fee_kobo_nonnegative check (delivery_fee_kobo >= 0),
  total_charged_online_kobo bigint not null,
  payment_expires_at timestamptz,
  provider_response_due_at timestamptz,
  checked_in_at timestamptz,
  collected_at timestamptz,
  cancelled_by text
    constraint bookings_cancelled_by_valid check (
      cancelled_by in ('farmer', 'provider', 'system', 'admin')
    ),
  cancel_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_end_date_matches check (end_date = start_date + duration_days),
  constraint bookings_deposit_percent_above_commission_rate check (
    deposit_percent > commission_rate
  ),
  constraint bookings_cancelled_by_status check (
    (cancelled_by is not null) = (status = 'cancelled')
  ),
  -- The remaining amounts cannot go negative: the subtotal, commission and deposit are rounded
  -- products of positive values and rates in [0, 1], and the deposit is at most the subtotal.
  constraint bookings_storage_subtotal_consistent check (
    storage_subtotal_kobo = round(quantity * duration_days * unit_price_kobo)
  ),
  constraint bookings_commission_consistent check (
    commission_kobo = round(commission_rate * storage_subtotal_kobo)
  ),
  constraint bookings_deposit_consistent check (
    deposit_kobo = round(deposit_percent * storage_subtotal_kobo)
  ),
  constraint bookings_balance_due_consistent check (
    balance_due_kobo = storage_subtotal_kobo - deposit_kobo
  ),
  constraint bookings_total_charged_online_consistent check (
    total_charged_online_kobo = deposit_kobo + service_fee_kobo + delivery_fee_kobo
  )
);

-- Availability (PRD 6.2) only counts bookings in the statuses that hold capacity, so index just
-- those. An unexpired payment_pending hold is told apart from an expired one by payment_expires_at
-- in the query.
create index bookings_provider_capacity_idx
  on public.bookings (provider_id, start_date, end_date)
  where status in ('payment_pending', 'pending_provider', 'confirmed', 'in_storage');

create index bookings_provider_id_created_at_idx on public.bookings (provider_id, created_at desc);
create index bookings_farmer_id_created_at_idx on public.bookings (farmer_id, created_at desc);

-- Scheduled jobs (PRD 7.13): release payment holds, expire unanswered bookings, send reminders.
create index bookings_status_payment_expires_at_idx
  on public.bookings (status, payment_expires_at);
create index bookings_status_provider_response_due_at_idx
  on public.bookings (status, provider_response_due_at);
create index bookings_status_end_date_idx on public.bookings (status, end_date);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();
