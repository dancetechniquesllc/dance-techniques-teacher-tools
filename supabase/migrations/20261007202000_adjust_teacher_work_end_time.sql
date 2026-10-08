create or replace function public.adjust_teacher_work_end_time(
  session_id uuid,
  corrected_ended_at timestamptz
)
returns public.teacher_work_sessions
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  entry public.teacher_work_sessions;
begin
  if not public.is_director_or_admin() then
    raise exception 'A director must adjust working hours.';
  end if;

  select * into entry
  from public.teacher_work_sessions
  where id = session_id
  for update;

  if not found or entry.ended_at is null then
    raise exception 'End the event before adjusting its hours.';
  end if;

  if corrected_ended_at <= entry.started_at then
    raise exception 'Clock-out time must be after clock-in time.';
  end if;

  if (corrected_ended_at at time zone 'America/Chicago')::date <> entry.work_date then
    raise exception 'Clock-out time must be on the recorded work date.';
  end if;

  update public.teacher_work_sessions
  set ended_at = corrected_ended_at,
      checkout_requested_at = corrected_ended_at,
      status = 'pending',
      reviewed_at = null,
      reviewed_by = null
  where id = entry.id
  returning * into entry;

  return entry;
end
$function$;

grant execute on function public.adjust_teacher_work_end_time(uuid, timestamptz) to authenticated;

