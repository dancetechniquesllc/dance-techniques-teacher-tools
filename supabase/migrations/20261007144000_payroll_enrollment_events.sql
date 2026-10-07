create table if not exists public.payroll_enrollment_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  from_class_id uuid references public.dance_classes(id) on delete set null,
  to_class_id uuid references public.dance_classes(id) on delete set null,
  event_type text not null check (event_type in ('school_change','teacher_change','unenrollment','pause','resume')),
  effective_date date not null,
  source_request_id uuid references public.enrollment_change_requests(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_class_id is not null or to_class_id is not null)
);

create unique index if not exists payroll_enrollment_events_request_key
  on public.payroll_enrollment_events (source_request_id, event_type);
create index if not exists payroll_enrollment_events_date_idx
  on public.payroll_enrollment_events (effective_date, student_id);

alter table public.payroll_enrollment_events enable row level security;

drop policy if exists payroll_enrollment_events_director_read on public.payroll_enrollment_events;
create policy payroll_enrollment_events_director_read
on public.payroll_enrollment_events for select to authenticated
using (public.current_profile_role() in ('admin','director'));

drop policy if exists payroll_enrollment_events_director_write on public.payroll_enrollment_events;
create policy payroll_enrollment_events_director_write
on public.payroll_enrollment_events for all to authenticated
using (public.current_profile_role() in ('admin','director'))
with check (public.current_profile_role() in ('admin','director'));

grant select, insert, update on public.payroll_enrollment_events to authenticated;

comment on table public.payroll_enrollment_events is
  'Effective-dated roster changes retained for accurate payroll after moves, pauses, and unenrollments.';
