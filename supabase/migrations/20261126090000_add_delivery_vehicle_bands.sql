-- The vehicle a delivery needs by the size of its load (PRD 7.7 step 2, decision 138). For each
-- load unit, bands from the smallest vehicle up: a vehicle takes loads below its `below`, and the
-- last band takes any load. A bike below the threshold and a van at or above it by default; a
-- tricycle or truck band can be added by an admin. The thresholds are placeholders the owner has
-- not confirmed. As in seed_reference_data (decision 40), an admin's value is never overwritten.
insert into public.app_config (key, value, description)
values
  ('delivery_vehicle_bands',
    '{"crates": [{"vehicle_type": "bike", "below": 6}, {"vehicle_type": "van", "below": null}], '
      '"kg": [{"vehicle_type": "bike", "below": 150}, {"vehicle_type": "van", "below": null}], '
      '"sqm": [{"vehicle_type": "bike", "below": 1}, {"vehicle_type": "van", "below": null}]}',
    'Delivery vehicle by load size, per load unit. Unconfirmed placeholder (PRD 5.15).')
on conflict (key) do nothing;
