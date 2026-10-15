create table if not exists public.recital_conflict_submissions (
  id uuid primary key default gen_random_uuid(),
  jotform_submission_id text not null unique,
  jotform_form_id text not null,
  student_id uuid references public.students(id) on delete set null,
  partner_school_id uuid references public.partner_schools(id) on delete set null,
  dancer_first_name text,
  dancer_last_name text,
  parent_email text,
  school_name text,
  conflict_type text,
  conflict_note text,
  available_before text,
  available_after text,
  policy_acknowledged boolean not null default false,
  status text not null default 'received' check (status in ('received','matched','unmatched','error')),
  error_message text,
  raw_submission jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recital_conflict_submissions_status_created_idx
  on public.recital_conflict_submissions (status, created_at desc);

alter table public.recital_conflict_submissions enable row level security;

drop policy if exists "Leaders can view recital conflict submissions" on public.recital_conflict_submissions;
create policy "Leaders can view recital conflict submissions"
on public.recital_conflict_submissions for select to authenticated
using (public.is_director_or_admin());

revoke all on public.recital_conflict_submissions from anon;
grant select on public.recital_conflict_submissions to authenticated;
grant select, insert, update on public.recital_conflict_submissions to service_role;

drop trigger if exists recital_conflict_submissions_set_updated_at on public.recital_conflict_submissions;
create trigger recital_conflict_submissions_set_updated_at before update on public.recital_conflict_submissions
for each row execute function public.set_updated_at();

comment on table public.recital_conflict_submissions is
  'Idempotent audit trail for the Jotform recital conflict form and its dancer match.';
