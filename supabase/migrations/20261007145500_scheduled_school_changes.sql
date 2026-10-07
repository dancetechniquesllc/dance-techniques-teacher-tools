alter table public.enrollment_change_requests
  add column if not exists school_change_processing_error text;

alter table public.enrollment_change_requests
  drop constraint if exists enrollment_change_requests_status_check;

alter table public.enrollment_change_requests
  add constraint enrollment_change_requests_status_check
  check (status in ('new','reviewing','scheduled','completed','archived'));

create or replace function public.process_due_enrollment_school_changes()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_record public.enrollment_change_requests%rowtype;
  processed_count integer := 0;
  local_today date := (now() at time zone 'America/Chicago')::date;
begin
  for request_record in
    select *
    from public.enrollment_change_requests
    where status = 'scheduled'
      and school_change_timing = 'scheduled'
      and school_change_effective_date is not null
      and school_change_effective_date <= local_today
    order by school_change_effective_date, created_at
    for update skip locked
  loop
    begin
      if request_record.assigned_student_id is null
        or request_record.assigned_class_enrollment_id is null
        or request_record.target_class_id is null
        or nullif(btrim(request_record.target_classroom), '') is null then
        raise exception 'The scheduled school change is missing its student, class enrollment, target class, or official classroom.';
      end if;

      if not exists (
        select 1 from public.dance_classes
        where id = request_record.target_class_id and status = 'active'
      ) then
        raise exception 'The assigned target class is no longer active.';
      end if;

      insert into public.payroll_enrollment_events (
        student_id, from_class_id, to_class_id, event_type, effective_date, source_request_id
      )
      select request_record.assigned_student_id, dance_class_id, request_record.target_class_id,
             'school_change', request_record.school_change_effective_date, request_record.id
      from public.class_enrollments
      where id = request_record.assigned_class_enrollment_id
        and student_id = request_record.assigned_student_id
      on conflict (source_request_id, event_type) do nothing;

      update public.class_enrollments
      set dance_class_id = request_record.target_class_id,
          status = 'enrolled',
          ended_date = null
      where id = request_record.assigned_class_enrollment_id
        and student_id = request_record.assigned_student_id;

      if not found then
        raise exception 'The dancer’s current class enrollment could not be found.';
      end if;

      update public.students
      set status = 'enrolled',
          classroom = coalesce(nullif(btrim(request_record.new_school_classroom), ''), nullif(btrim(request_record.target_classroom), '')),
          official_classroom = nullif(btrim(request_record.target_classroom), '')
      where id = request_record.assigned_student_id;

      update public.enrollments
      set matched_dance_class_id = request_record.target_class_id,
          requested_school_name = coalesce(nullif(btrim(request_record.target_school), ''), requested_school_name),
          student_classroom = coalesce(nullif(btrim(request_record.new_school_classroom), ''), student_classroom),
          official_classroom = nullif(btrim(request_record.target_classroom), '')
      where placed_student_id = request_record.assigned_student_id;

      update public.enrollment_change_requests
      set status = 'completed',
          completed_at = now(),
          school_change_processing_error = null
      where id = request_record.id;

      processed_count := processed_count + 1;
    exception when others then
      update public.enrollment_change_requests
      set school_change_processing_error = sqlerrm
      where id = request_record.id;
    end;
  end loop;

  return processed_count;
end;
$$;

revoke all on function public.process_due_enrollment_school_changes() from public;
revoke all on function public.process_due_enrollment_school_changes() from anon;
revoke all on function public.process_due_enrollment_school_changes() from authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'process-due-enrollment-school-changes';

  perform cron.schedule(
    'process-due-enrollment-school-changes',
    '*/15 * * * *',
    'select public.process_due_enrollment_school_changes();'
  );
exception when undefined_table or invalid_schema_name then
  raise notice 'pg_cron is unavailable; schedule process_due_enrollment_school_changes every 15 minutes in Supabase Cron.';
end;
$$;
