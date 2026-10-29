-- The foreign key add_payments_and_payouts left for delivery_requests (decision 30). Restrict: a
-- delivery that has been paid for keeps its payment record.

alter table public.payments
  add constraint payments_delivery_request_id_fkey
  foreign key (delivery_request_id) references public.delivery_requests on delete restrict;

create index payments_delivery_request_id_idx on public.payments (delivery_request_id);
