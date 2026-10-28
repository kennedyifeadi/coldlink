-- Price observations for later market analytics (PRD 5.11, 15): one row per listing, whatever its
-- status, since every listing records the price a farmer asked.
--
-- The week is the Monday of the week the farmer set the price, in Lagos time, so it does not shift
-- with the session's time zone. created_at is when the price was stated, and it never changes.
--
-- Views run with their owner's rights by default, which would skip RLS on produce_listings and show
-- draft listings to anyone granted the view. security_invoker makes the reader's own rights apply.

create view public.v_listing_price_observations
with (security_invoker = true)
as
select
  crop_id,
  date_trunc('week', created_at at time zone 'Africa/Lagos')::date as week,
  unit_price_kobo,
  unit
from public.produce_listings;

-- Drafts are visible only to the API (PRD 7.10). Default privileges already leave the view without
-- client privileges; revoke them here too, so this does not depend on that.
revoke all on table public.v_listing_price_observations from anon, authenticated;
