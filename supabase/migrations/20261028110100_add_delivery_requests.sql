-- Delivery requests (PRD 5.10, 7.7). Enum-like values match packages/shared/src/enums.ts. The status
-- check allows every shared status; the checks at the bottom only tie the fields to the status
-- where the link is unambiguous.

create table public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  context_type text not null
    constraint delivery_requests_context_type_valid check (
      context_type in ('booking_inbound', 'booking_outbound', 'marketplace_order')
    ),
  -- No foreign key: the row it points to is a booking today and a marketplace order later, so its
  -- table depends on context_type. The API checks it exists when it creates the request.
  context_id uuid not null,
  requested_by uuid not null references public.users on delete restrict,
  -- Null until an admin assigns a partner (PRD 7.7 step 4).
  partner_id uuid references public.delivery_partners on delete restrict,
  pickup_text text not null,
  pickup_location extensions.geography(Point, 4326) not null,
  dropoff_text text not null,
  dropoff_location extensions.geography(Point, 4326) not null,
  -- The person at the pickup or dropoff. PRD 7.7 asks the farmer for a phone, not always a name.
  contact_name text,
  contact_phone text not null
    constraint delivery_requests_contact_phone_format check (contact_phone ~ '^\+234[0-9]{10}$'),
  load_description text not null,
  load_quantity numeric not null
    constraint delivery_requests_load_quantity_positive check (load_quantity > 0),
  load_unit text not null,
  distance_km numeric not null
    constraint delivery_requests_distance_km_nonnegative check (distance_km >= 0),
  vehicle_type text not null
    constraint delivery_requests_vehicle_type_valid check (
      vehicle_type in ('bike', 'tricycle', 'van', 'truck')
    ),
  fee_kobo bigint not null
    constraint delivery_requests_fee_kobo_positive check (fee_kobo > 0),
  partner_payout_kobo bigint not null
    constraint delivery_requests_partner_payout_kobo_nonnegative check (partner_payout_kobo >= 0),
  platform_margin_kobo bigint not null
    constraint delivery_requests_platform_margin_kobo_nonnegative check (
      platform_margin_kobo >= 0
    ),
  status text not null
    constraint delivery_requests_status_valid check (
      status in (
        'requested',
        'assigned',
        'accepted',
        'picked_up',
        'delivered',
        'cancelled',
        'failed'
      )
    ),
  -- Stored in plain text, unlike OTP codes: the farmer has to read it back in the app to pass it
  -- to the recipient, and a hash cannot be shown. It is only good for one delivery.
  handover_code text not null
    constraint delivery_requests_handover_code_format check (handover_code ~ '^[0-9]{4}$'),
  scheduled_for timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The partner's share and ColdLink's margin split the fee exactly (PRD 7.7 step 6).
  constraint delivery_requests_fee_split_consistent check (
    partner_payout_kobo + platform_margin_kobo = fee_kobo
  ),
  -- requested means unassigned; from assigned on there is a partner. A request cancelled or failed
  -- may or may not have had one.
  constraint delivery_requests_partner_id_status check (
    case
      when status = 'requested' then partner_id is null
      when status in ('assigned', 'accepted', 'picked_up', 'delivered') then partner_id is not null
      else true
    end
  ),
  constraint delivery_requests_assigned_at_partner_id check (
    (assigned_at is not null) = (partner_id is not null)
  ),
  -- Picked up before it is delivered; a cancelled or failed job may have been picked up or not.
  constraint delivery_requests_picked_up_at_status check (
    case
      when status in ('requested', 'assigned', 'accepted') then picked_up_at is null
      when status in ('picked_up', 'delivered') then picked_up_at is not null
      else true
    end
  ),
  constraint delivery_requests_delivered_at_status check (
    (delivered_at is not null) = (status = 'delivered')
  )
);

create index delivery_requests_context_idx on public.delivery_requests (context_type, context_id);
-- The admin delivery queue (PRD 7.11).
create index delivery_requests_status_created_at_idx
  on public.delivery_requests (status, created_at);
create index delivery_requests_partner_id_idx on public.delivery_requests (partner_id);

create trigger delivery_requests_set_updated_at
  before update on public.delivery_requests
  for each row execute function public.set_updated_at();
