-- The per-phone OTP limits count every code sent to a number in the last day, consumed or not,
-- which the partial otp_codes_phone_unconsumed_idx cannot serve.
create index otp_codes_phone_created_at_idx on public.otp_codes (phone, created_at desc);
