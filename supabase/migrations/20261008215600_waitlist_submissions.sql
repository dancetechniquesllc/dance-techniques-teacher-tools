create table if not exists public.waitlist_submissions (
  id uuid primary key default gen_random_uuid(),
  jotform_submission_id text not null unique,
  jotform_form_id text not null,
  partner_school_id uuid references public.partner_schools(id) on delete set null,
  dance_class_id uuid references public.dance_classes(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  class_enrollment_id uuid references public.class_enrollments(id) on delete set null,
  status text not null default 'received' check (status in ('received', 'placed', 'error')),
  error_message text,
  raw_submission jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waitlist_submissions_school_idx
  on public.waitlist_submissions (partner_school_id, created_at desc);

alter table public.waitlist_submissions enable row level security;

drop policy if exists "Leaders can view waitlist submissions" on public.waitlist_submissions;
create policy "Leaders can view waitlist submissions"
on public.waitlist_submissions for select to authenticated
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid()
    and profiles.active
    and profiles.role in ('admin', 'director')
));

grant select on public.waitlist_submissions to authenticated;

drop trigger if exists waitlist_submissions_set_updated_at on public.waitlist_submissions;
create trigger waitlist_submissions_set_updated_at before update on public.waitlist_submissions
for each row execute function public.set_updated_at();

comment on table public.waitlist_submissions is
  'Idempotent audit trail for Jotform waitlist submissions placed in Future Dancers.';
