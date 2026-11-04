-- Availability (PRD 6.2): capacity_total minus the peak daily occupancy over [p_start_date,
-- p_end_date). A booking occupies [start_date, end_date), so a booking ending on the day another
-- starts does not stack with it. Only bookings that hold capacity count, and a payment_pending hold
-- stops counting once payment_expires_at passes, before the expiry job has set it to expired.
--
-- The result is floored at 0. A provider can be over-booked only by lowering capacity_total under
-- existing bookings; nothing more can be booked then, and a negative quantity would mean nothing to
-- a farmer.
--
-- Stable, not immutable: it reads tables and now(), which is fixed for the transaction.
create function public.provider_available_quantity(
  p_provider_id uuid,
  p_start_date date,
  p_end_date date
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_capacity_total numeric;
  v_peak_occupancy numeric;
begin
  if p_start_date is null or p_end_date is null or p_end_date <= p_start_date then
    raise exception 'end date (%) must be after start date (%)', p_end_date, p_start_date
      using errcode = 'invalid_parameter_value';
  end if;

  select capacity_total into v_capacity_total
  from public.providers
  where id = p_provider_id;

  if not found then
    raise exception 'provider % does not exist', p_provider_id
      using errcode = 'no_data_found';
  end if;

  -- The status list matches the predicate of bookings_provider_capacity_idx, so the index applies.
  select coalesce(max(daily.occupancy), 0) into v_peak_occupancy
  from (
    select sum(b.quantity) as occupancy
    from generate_series(0, p_end_date - p_start_date - 1) as offsets(day_offset)
    join public.bookings b
      on b.start_date <= p_start_date + offsets.day_offset
      and b.end_date > p_start_date + offsets.day_offset
    where b.provider_id = p_provider_id
      and b.start_date < p_end_date
      and b.end_date > p_start_date
      and b.status in ('payment_pending', 'pending_provider', 'confirmed', 'in_storage')
      and (b.status <> 'payment_pending' or b.payment_expires_at > now())
    group by offsets.day_offset
  ) as daily;

  return greatest(v_capacity_total - v_peak_occupancy, 0);
end;
$$;

revoke execute on function public.provider_available_quantity(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.provider_available_quantity(uuid, date, date) to service_role;
