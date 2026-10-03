create table if not exists public.enrollment_change_requests (
  id uuid primary key default gen_random_uuid(),
  jotform_submission_id text not null unique,
  jotform_form_id text not null,
  dancer_first_name text,
  dancer_last_name text,
  current_school text,
  last_day date,
  request_type text,
  notes text,
  policy_acknowledged boolean not null default false,
  status text not null default 'new' check (status in ('new','reviewing','completed','archived')),
  assigned_student_id uuid references public.students(id) on delete set null,
  assigned_class_enrollment_id uuid references public.class_enrollments(id) on delete set null,
  target_school text,
  target_class_id uuid references public.dance_classes(id) on delete set null,
  target_classroom text,
  enrollment_fee_refund_status text not null default 'pending' check (enrollment_fee_refund_status in ('pending','completed','not_needed')),
  brightwheel_refund_status text not null default 'pending' check (brightwheel_refund_status in ('pending','completed','not_needed')),
  billing_plan_status text not null default 'pending' check (billing_plan_status in ('pending','completed')),
  deactivation_status text not null default 'pending' check (deactivation_status in ('pending','completed')),
  raw_submission jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enrollment_change_requests_status_created_idx on public.enrollment_change_requests(status,created_at desc);
drop trigger if exists enrollment_change_requests_set_updated_at on public.enrollment_change_requests;
create trigger enrollment_change_requests_set_updated_at before update on public.enrollment_change_requests for each row execute function public.set_updated_at();
alter table public.enrollment_change_requests enable row level security;
create policy "leaders manage enrollment change requests" on public.enrollment_change_requests for all to authenticated using (public.is_director_or_admin()) with check (public.is_director_or_admin());
revoke all on public.enrollment_change_requests from anon;
grant select,update on public.enrollment_change_requests to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='enrollment_change_requests') then
    alter publication supabase_realtime add table public.enrollment_change_requests;
  end if;
end $$;
