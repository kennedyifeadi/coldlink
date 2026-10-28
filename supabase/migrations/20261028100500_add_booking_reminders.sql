-- One row per reminder sent for a booking (PRD 7.6, 7.13). The reminder job inserts the row with
-- on conflict do nothing and queues the notification only if the insert went through, both in one
-- transaction, so a reminder can never be sent twice, even by two overlapping runs. The queued
-- notification is then retried by the notifications job like any other. Kinds match
-- packages/shared/src/enums.ts.

create table public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings on delete restrict,
  kind text not null
    constraint booking_reminders_kind_valid check (
      kind in ('expiry_two_days_before', 'expiry_last_day', 'collection_due')
    ),
  notification_id uuid references public.notifications on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_reminders_booking_id_kind_key unique (booking_id, kind)
);

create trigger booking_reminders_set_updated_at
  before update on public.booking_reminders
  for each row execute function public.set_updated_at();
