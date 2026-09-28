-- Enrollment alerts are actionable only while the intake record still needs
-- placement. Voided, placed, and refunded records must disappear from the
-- teacher notification center automatically.

create or replace function public.dismiss_resolved_enrollment_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status in ('placed', 'archived')
     or new.placed_class_enrollment_id is not null
     or coalesce(new.additional_information->>'original_enrollment_fee_status', '') = 'refunded'
  then
    update public.teacher_notifications
    set dismissed_at = coalesce(dismissed_at, now()),
        read_at = coalesce(read_at, now())
    where metadata->>'enrollment_id' = new.id::text
      and notification_type in (
        'new_enrollment',
        'same_day_enrollment',
        'unpaid_enrollment_fee'
      )
      and dismissed_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists dismiss_resolved_enrollment_notifications on public.enrollments;
create trigger dismiss_resolved_enrollment_notifications
after insert or update of status, placed_class_enrollment_id, additional_information
on public.enrollments
for each row execute function public.dismiss_resolved_enrollment_notifications();

-- Clear alerts that became stale before this trigger existed, including
-- legacy refunds preserved during the paid/unpaid status migration.
update public.teacher_notifications notification
set dismissed_at = coalesce(notification.dismissed_at, now()),
    read_at = coalesce(notification.read_at, now())
from public.enrollments enrollment
where notification.metadata->>'enrollment_id' = enrollment.id::text
  and notification.notification_type in (
    'new_enrollment',
    'same_day_enrollment',
    'unpaid_enrollment_fee'
  )
  and notification.dismissed_at is null
  and (
    enrollment.status in ('placed', 'archived')
    or enrollment.placed_class_enrollment_id is not null
    or coalesce(enrollment.additional_information->>'original_enrollment_fee_status', '') = 'refunded'
  );

create or replace function public.queue_daily_take_today_notifications(force_run boolean default false)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  local_now timestamp := timezone('America/Chicago', now());
  local_today date := local_now::date;
  candidate record;
  inserted_count integer := 0;
  inserted_rows integer;
begin
  if not force_run and extract(hour from local_now) <> 6 then
    return 0;
  end if;

  for candidate in
    select
      enrollment.id,
      enrollment.student_first_name,
      enrollment.student_last_name,
      enrollment.student_birth_date,
      enrollment.student_classroom,
      enrollment.requested_school_name,
      enrollment.medical_notes,
      school.id as school_id,
      school.name as school_name
    from public.enrollments enrollment
    join lateral (
      select partner_school.*
      from public.partner_schools partner_school
      cross join lateral (
        select
          lower(regexp_replace(coalesce(enrollment.requested_school_name, ''), '\\W+', '', 'g')) as requested_key,
          lower(regexp_replace(partner_school.name, '\\W+', '', 'g')) as name_key,
          lower(regexp_replace(coalesce(partner_school.nickname, ''), '\\W+', '', 'g')) as nickname_key
      ) keys
      where partner_school.active
        and (
          partner_school.id = enrollment.matched_partner_school_id
          or (
            length(keys.requested_key) >= 5
            and (
              keys.name_key = keys.requested_key
              or keys.nickname_key = keys.requested_key
              or keys.name_key like '%' || keys.requested_key || '%'
              or keys.requested_key like '%' || keys.name_key || '%'
              or (length(keys.nickname_key) >= 5 and keys.nickname_key like '%' || keys.requested_key || '%')
              or (length(keys.nickname_key) >= 5 and keys.requested_key like '%' || keys.nickname_key || '%')
            )
          )
        )
      order by
        case
          when partner_school.id = enrollment.matched_partner_school_id then 0
          when keys.name_key = keys.requested_key then 1
          when keys.nickname_key = keys.requested_key then 2
          else 3
        end,
        least(abs(length(keys.name_key) - length(keys.requested_key)),
              abs(length(keys.nickname_key) - length(keys.requested_key)))
      limit 1
    ) school on true
    where enrollment.status in ('new', 'reviewing', 'needs_follow_up')
      and enrollment.placed_class_enrollment_id is null
      and enrollment.matched_dance_class_id is null
      and coalesce(enrollment.additional_information->>'original_enrollment_fee_status', '') <> 'refunded'
      and school.dance_day = extract(dow from local_today)
      and (
        enrollment.placed_student_id is null
        or not exists (
          select 1
          from public.class_enrollments class_enrollment
          where class_enrollment.student_id = enrollment.placed_student_id
            and class_enrollment.status in ('trial', 'enrolled')
        )
      )
  loop
    insert into public.teacher_notifications (
      teacher_id, title, message, notification_type, priority,
      action_url, metadata, push_requested_at
    )
    select
      assignment.teacher_id,
      'New dancer for today',
      coalesce(
        nullif(btrim(concat_ws(' ', candidate.student_first_name, candidate.student_last_name)), ''),
        'A new dancer'
      ) || ' needs a class at ' || candidate.school_name || ' today.',
      'same_day_enrollment',
      'urgent',
      '/?open=notifications',
      jsonb_build_object(
        'enrollment_id', candidate.id,
        'school_id', candidate.school_id,
        'take_today_date', local_today,
        'student_first_name', candidate.student_first_name,
        'student_last_name', candidate.student_last_name,
        'student_birth_date', candidate.student_birth_date,
        'student_classroom', candidate.student_classroom,
        'requested_school_name', candidate.requested_school_name,
        'medical_notes', candidate.medical_notes
      ),
      now()
    from public.teacher_school_assignments assignment
    where assignment.partner_school_id = candidate.school_id
      and assignment.active
      and not exists (
        select 1
        from public.teacher_notifications existing
        where existing.teacher_id = assignment.teacher_id
          and existing.notification_type = 'same_day_enrollment'
          and existing.metadata->>'enrollment_id' = candidate.id::text
          and timezone('America/Chicago', existing.created_at)::date = local_today
      );

    get diagnostics inserted_rows = row_count;
    inserted_count := inserted_count + inserted_rows;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.queue_daily_take_today_notifications(boolean) from public;
revoke all on function public.queue_daily_take_today_notifications(boolean) from anon;
revoke all on function public.queue_daily_take_today_notifications(boolean) from authenticated;

