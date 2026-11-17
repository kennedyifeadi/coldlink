-- One SMS link lets the provider accept or reject (decision 98), so a single purpose replaces the
-- separate accept and reject ones. None were ever issued; a row with either would fail this.
alter table public.action_tokens drop constraint action_tokens_purpose_valid;
alter table public.action_tokens add constraint action_tokens_purpose_valid check (
  purpose in ('provider_respond_booking', 'delivery_accept', 'delivery_update')
);
