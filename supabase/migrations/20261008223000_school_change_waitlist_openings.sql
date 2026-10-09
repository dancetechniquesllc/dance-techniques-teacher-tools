alter table public.enrollment_change_requests
  add column if not exists waitlist_prompted_at timestamptz;

update public.enrollment_change_requests
set waitlist_prompted_at = coalesce(completed_at, now())
where status = 'completed'
  and target_class_id is not null
  and waitlist_prompted_at is null;

comment on column public.enrollment_change_requests.waitlist_prompted_at is
  'Records when Director Dashboard evaluated the old school for eligible waitlist dancers after a completed school change.';
