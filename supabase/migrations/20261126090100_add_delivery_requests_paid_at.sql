-- When a delivery's fee was paid (decision 142): with its booking, once the booking's charge is
-- confirmed, or through its own delivery_fee charge for a delivery requested later. A delivery is
-- live, and work for admins, only while it is paid and neither cancelled nor failed; an unpaid
-- request stays null and is never shown to them.
alter table public.delivery_requests add column paid_at timestamptz;

-- A delivery is refunded at most once (decision 144), whichever charge paid for it. Booking refunds
-- have no delivery_request_id and keep decision 95's one row per booking.
create unique index payments_delivery_request_refund_key
  on public.payments (delivery_request_id)
  where purpose = 'refund' and delivery_request_id is not null;
