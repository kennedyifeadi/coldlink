-- The owner's payment settings (decision 90). As in seed_reference_data (decision 40), nothing an
-- admin has already changed is overwritten: the hold moves to 30 minutes only while it still has
-- the seeded 15, and the channels are added only if the key is not there yet.
update public.app_config
set value = '30'
where key = 'payment_hold_minutes' and value = '15'::jsonb;

-- Paystack's own channel names (its Initialize Transaction API): cards, direct bank debit, USSD
-- and bank transfer, since many farmers have no card (OQ-4).
insert into public.app_config (key, value, description)
values
  ('paystack_channels', '["card", "bank", "ussd", "bank_transfer"]',
    'Payment channels offered at Paystack checkout, as Paystack names them.')
on conflict (key) do nothing;
