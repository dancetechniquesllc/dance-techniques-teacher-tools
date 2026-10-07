alter table public.enrollment_change_requests
  add column if not exists submitted_by_role text,
  add column if not exists new_school_relationship text,
  add column if not exists requested_new_school text,
  add column if not exists new_school_classroom text,
  add column if not exists school_change_timing text,
  add column if not exists school_change_effective_date date,
  add column if not exists requested_start_date date,
  add column if not exists requested_return_date date,
  add column if not exists teacher_reason text,
  add column if not exists brightwheel_refund_details jsonb not null default '[]'::jsonb;
