-- Booking audit log (PRD 5.6): every status change writes a row. It is append-only, so it has no
-- updated_at. RLS does not bind the service role the API connects as, so triggers refuse every
-- update, delete and truncate, whoever runs them. Only a superuser disabling triggers gets past.

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings on delete restrict,
  -- Null on the event that creates the booking.
  from_status text
    constraint booking_events_from_status_valid check (
      from_status in (
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
  to_status text not null
    constraint booking_events_to_status_valid check (
      to_status in (
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
  actor_type text not null
    constraint booking_events_actor_type_valid check (
      actor_type in ('farmer', 'provider', 'delivery_partner', 'system', 'admin')
    ),
  -- No foreign key: which table the id belongs to depends on actor_type, and the log must outlive
  -- whatever it points to. Null for system actions.
  actor_id uuid,
  metadata jsonb not null default '{}'
    constraint booking_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index booking_events_booking_id_created_at_idx
  on public.booking_events (booking_id, created_at);

create function public.reject_booking_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'booking_events is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger booking_events_no_update_or_delete
  before update or delete on public.booking_events
  for each row execute function public.reject_booking_event_change();

create trigger booking_events_no_truncate
  before truncate on public.booking_events
  for each statement execute function public.reject_booking_event_change();
