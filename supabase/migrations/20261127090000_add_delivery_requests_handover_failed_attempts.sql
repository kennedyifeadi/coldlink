-- Wrong handover codes entered on the partner's update link (decision 150). Four digits can be
-- guessed, so the link stops taking codes after five wrong ones. The count is per delivery, not per
-- token, so issuing a fresh link (a resend) never resets it.
alter table public.delivery_requests
  add column handover_failed_attempts integer not null default 0
    constraint delivery_requests_handover_failed_attempts_nonnegative check (
      handover_failed_attempts >= 0
    );
