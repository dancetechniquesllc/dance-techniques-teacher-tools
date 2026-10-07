alter table public.enrollment_change_requests
  add column if not exists pause_decision text,
  add column if not exists approved_pause_stop_date date,
  add column if not exists approved_pause_resume_date date,
  add column if not exists pause_activated_at timestamptz,
  add column if not exists pause_resumed_at timestamptz;

alter table public.enrollment_change_requests
  drop constraint if exists enrollment_change_requests_pause_decision_check;
alter table public.enrollment_change_requests
  add constraint enrollment_change_requests_pause_decision_check
  check (pause_decision is null or pause_decision in ('approved','denied'));

alter table public.enrollment_change_requests
  drop constraint if exists enrollment_change_requests_status_check;
alter table public.enrollment_change_requests
  add constraint enrollment_change_requests_status_check
  check (status in ('new','reviewing','scheduled','active','completed','archived'));

drop index if exists public.one_current_class_per_student;
create unique index one_current_class_per_student
  on public.class_enrollments (student_id)
  where status in ('trial','enrolled','paused');

create or replace function public.approve_tuition_pause(
  target_request_id uuid,
  target_stop_date date,
  target_resume_date date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_record public.enrollment_change_requests%rowtype;
  current_class_id uuid;
begin
  if public.current_profile_role() not in ('admin','director') then
    raise exception 'Only a director or administrator can approve a tuition pause.';
  end if;
  if target_stop_date is null or target_resume_date is null or target_resume_date - target_stop_date <= 28 then
    raise exception 'A tuition pause must be longer than four weeks.';
  end if;

  select * into request_record
  from public.enrollment_change_requests
  where id = target_request_id
  for update;
  if request_record.assigned_student_id is null or request_record.assigned_class_enrollment_id is null then
    raise exception 'Assign the request to a dancer before approving it.';
  end if;

  select dance_class_id into current_class_id
  from public.class_enrollments
  where id = request_record.assigned_class_enrollment_id
    and student_id = request_record.assigned_student_id;
  if current_class_id is null then raise exception 'The dancer’s class enrollment could not be found.'; end if;

  update public.enrollment_change_requests
  set pause_decision = 'approved',
      approved_pause_stop_date = target_stop_date,
      approved_pause_resume_date = target_resume_date,
      status = 'scheduled', reviewed_by = auth.uid(), reviewed_at = now(), completed_at = null,
      pause_activated_at = null, pause_resumed_at = null
  where id = target_request_id;

  insert into public.payroll_enrollment_events
    (student_id, from_class_id, event_type, effective_date, source_request_id, created_by)
  values
    (request_record.assigned_student_id, current_class_id, 'pause', target_stop_date, target_request_id, auth.uid())
  on conflict (source_request_id, event_type) do update
    set from_class_id = excluded.from_class_id, effective_date = excluded.effective_date, created_by = excluded.created_by;

  insert into public.payroll_enrollment_events
    (student_id, to_class_id, event_type, effective_date, source_request_id, created_by)
  values
    (request_record.assigned_student_id, current_class_id, 'resume', target_resume_date, target_request_id, auth.uid())
  on conflict (source_request_id, event_type) do update
    set to_class_id = excluded.to_class_id, effective_date = excluded.effective_date, created_by = excluded.created_by;
end;
$$;

create or replace function public.process_due_tuition_pauses()
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
    select * from public.enrollment_change_requests
    where pause_decision = 'approved' and status in ('scheduled','active')
    order by approved_pause_stop_date, created_at
    for update skip locked
  loop
    if request_record.status = 'scheduled' and request_record.approved_pause_stop_date <= local_today then
      update public.class_enrollments set status = 'paused', ended_date = null
      where id = request_record.assigned_class_enrollment_id and student_id = request_record.assigned_student_id;
      update public.students set status = 'paused' where id = request_record.assigned_student_id;
      update public.enrollment_change_requests set status = 'active', pause_activated_at = coalesce(pause_activated_at,now()) where id = request_record.id;
      request_record.status := 'active';
      processed_count := processed_count + 1;
    end if;
    if request_record.status = 'active' and request_record.approved_pause_resume_date <= local_today then
      update public.class_enrollments set status = 'enrolled', ended_date = null
      where id = request_record.assigned_class_enrollment_id and student_id = request_record.assigned_student_id;
      update public.students set status = 'enrolled' where id = request_record.assigned_student_id;
      update public.enrollment_change_requests set status = 'completed', completed_at = now(), pause_resumed_at = now() where id = request_record.id;
      processed_count := processed_count + 1;
    end if;
  end loop;
  return processed_count;
end;
$$;

create or replace function public.resume_paused_student(target_student_id uuid, target_class_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_id uuid;
  local_today date := (now() at time zone 'America/Chicago')::date;
begin
  if public.current_profile_role() not in ('admin','director') and not exists (
    select 1 from public.dance_classes dc
    join public.teacher_school_assignments tsa on tsa.id = dc.teacher_school_assignment_id
    where dc.id = target_class_id and tsa.teacher_id = auth.uid() and tsa.active
  ) then raise exception 'You are not assigned to this dancer’s class.'; end if;

  select id into request_id from public.enrollment_change_requests
  where assigned_student_id = target_student_id and pause_decision = 'approved' and status = 'active'
  order by approved_pause_stop_date desc limit 1 for update;
  if request_id is null then raise exception 'No active tuition pause was found for this dancer.'; end if;

  update public.class_enrollments set status = 'enrolled', ended_date = null
  where student_id = target_student_id and dance_class_id = target_class_id and status = 'paused';
  if not found then raise exception 'The paused class enrollment could not be found.'; end if;
  update public.students set status = 'enrolled' where id = target_student_id;
  update public.enrollment_change_requests
    set approved_pause_resume_date = local_today, status = 'completed', completed_at = now(), pause_resumed_at = now()
    where id = request_id;
  update public.payroll_enrollment_events
    set effective_date = local_today, to_class_id = target_class_id, created_by = auth.uid()
    where source_request_id = request_id and event_type = 'resume';
end;
$$;

revoke all on function public.approve_tuition_pause(uuid,date,date) from public, anon;
grant execute on function public.approve_tuition_pause(uuid,date,date) to authenticated;
revoke all on function public.resume_paused_student(uuid,uuid) from public, anon;
grant execute on function public.resume_paused_student(uuid,uuid) to authenticated;
revoke all on function public.process_due_tuition_pauses() from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'process-due-tuition-pauses';
  perform cron.schedule('process-due-tuition-pauses','*/15 * * * *','select public.process_due_tuition_pauses();');
exception when undefined_table or invalid_schema_name then
  raise notice 'pg_cron is unavailable; schedule process_due_tuition_pauses every 15 minutes in Supabase Cron.';
end;
$$;
