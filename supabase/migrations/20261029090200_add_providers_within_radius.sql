-- Providers within p_radius_km of a point, nearest first, with the distance in km (PRD 6.8).
-- ST_DWithin on the geography column lets providers_location_idx (GiST) apply, and both it and
-- ST_Distance measure on the spheroid in metres.
--
-- This is purely geographic. The approval, accepting-bookings, crop category and availability
-- filters, the rating tie-break and the retry at search_max_radius_km belong to the search
-- endpoint, which composes this function with provider_available_quantity in one query.
--
-- Stable, not immutable: it reads providers.
create function public.providers_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km numeric
)
returns table (provider_id uuid, distance_km double precision)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_origin extensions.geography;
begin
  if p_lat is null or not p_lat between -90 and 90 then
    raise exception 'latitude (%) must be between -90 and 90', p_lat
      using errcode = 'invalid_parameter_value';
  end if;

  if p_lng is null or not p_lng between -180 and 180 then
    raise exception 'longitude (%) must be between -180 and 180', p_lng
      using errcode = 'invalid_parameter_value';
  end if;

  if p_radius_km is null or p_radius_km = 'NaN' or p_radius_km <= 0 then
    raise exception 'radius (% km) must be greater than 0', p_radius_km
      using errcode = 'invalid_parameter_value';
  end if;

  -- ST_MakePoint takes longitude first.
  v_origin :=
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  return query
  select p.id, extensions.st_distance(p.location, v_origin) / 1000
  from public.providers p
  where extensions.st_dwithin(p.location, v_origin, (p_radius_km * 1000)::double precision)
  order by 2, p.id;
end;
$$;

revoke execute on function
  public.providers_within_radius(double precision, double precision, numeric)
  from public, anon, authenticated;
grant execute on function
  public.providers_within_radius(double precision, double precision, numeric)
  to service_role;
