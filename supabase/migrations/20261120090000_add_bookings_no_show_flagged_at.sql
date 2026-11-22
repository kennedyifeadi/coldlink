-- When the daily no-show job (PRD 7.13, decision 116) found a confirmed booking whose whole start
-- day in Lagos had passed with no check-in. The job sets it once and never clears it, and the
-- status stays confirmed: forfeiting the deposit is an admin's call (PRD 6.5), made from the admin
-- screens, which list these. Clients have no access to bookings, so RLS needs nothing new.
alter table public.bookings add column no_show_flagged_at timestamptz;
