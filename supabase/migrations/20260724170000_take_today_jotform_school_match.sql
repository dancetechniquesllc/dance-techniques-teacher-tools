-- Match the school selected in Jotform to the closest active partner-school
-- name or nickname. The dancer does not need to be assigned yet.

create or replace function public.notify_new_enrollment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  school_record public.partner_schools;
  is_dance_day boolean := false;
  dancer_name text := btrim(concat_ws(' ', new.student_first_name, new.student_last_name));
begin
  select school.* into school_record
  from public.partner_schools school
  cross join lateral (
    select
      lower(regexp_replace(coalesce(new.requested_school_name, ''), '\\W+', '', 'g')) as requested_key,
      lower(regexp_replace(school.name, '\\W+', '', 'g')) as name_key,
      lower(regexp_replace(coalesce(school.nickname, ''), '\\W+', '', 'g')) as nickname_key
  ) keys
  where school.active
    and length(keys.requested_key) >= 5
    and (
      keys.name_key = keys.requested_key
      or keys.nickname_key = keys.requested_key
      or keys.name_key like '%' || keys.requested_key || '%'
      or keys.requested_key like '%' || keys.name_key || '%'
      or (length(keys.nickname_key) >= 5 and keys.nickname_key like '%' || keys.requested_key || '%')
      or (length(keys.nickname_key) >= 5 and keys.requested_key like '%' || keys.nickname_key || '%')
    )
  order by
    case
      when keys.name_key = keys.requested_key then 0
      when keys.nickname_key = keys.requested_key then 1
      else 2
    end,
    least(abs(length(keys.name_key) - length(keys.requested_key)),
          abs(length(keys.nickname_key) - length(keys.requested_key)))
  limit 1;

  is_dance_day := school_record.id is not null
    and school_record.dance_day = extract(dow from timezone('America/Chicago', coalesce(new.submitted_at, new.created_at)));

  insert into public.teacher_notifications (
    teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
  )
  select p.id,
         case when is_dance_day then 'New dance-day enrollment' else 'New enrollment' end,
         coalesce(nullif(dancer_name, ''), 'A new dancer') || ' enrolled for ' || coalesce(new.requested_school_name, 'a partner school') || '.',
         case when is_dance_day then 'same_day_enrollment' else 'new_enrollment' end,
         case when is_dance_day then 'urgent' else 'routine' end,
         '/?open=enrollment&id=' || new.id,
         jsonb_build_object('enrollment_id', new.id, 'school_id', school_record.id),
         case when is_dance_day then now() else null end
  from public.profiles p
  where p.active and p.role in ('admin', 'director');

  if new.payment_status <> 'paid' then
    insert into public.teacher_notifications (
      teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
    )
    select p.id,
           'Enrollment fee needs attention',
           coalesce(nullif(dancer_name, ''), 'A new dancer') || ' has an unpaid or unsuccessful enrollment fee.',
           'unpaid_enrollment_fee', 'routine',
           '/?open=enrollment&id=' || new.id,
           jsonb_build_object('enrollment_id', new.id, 'payment_status', new.payment_status),
           now()
    from public.profiles p
    where p.active and p.role in ('admin', 'director');
  end if;

  if is_dance_day then
    insert into public.teacher_notifications (
      teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
    )
    select assignment.teacher_id,
           'New dancer for today',
           coalesce(nullif(dancer_name, ''), 'A new dancer') || ' enrolled for ' || school_record.name || ' today.',
           'same_day_enrollment', 'urgent',
           '/?open=notifications',
           jsonb_build_object(
             'enrollment_id', new.id,
             'student_first_name', new.student_first_name,
             'student_last_name', new.student_last_name,
             'student_birth_date', new.student_birth_date,
             'student_classroom', new.student_classroom,
             'requested_school_name', new.requested_school_name,
             'medical_notes', new.medical_notes
           ),
           now()
    from public.teacher_school_assignments assignment
    where assignment.partner_school_id = school_record.id
      and assignment.active;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_new_enrollment() from public;
