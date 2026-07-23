alter table public.students
  add column if not exists kit_ready boolean not null default false,
  add column if not exists kit_ready_at timestamptz,
  add column if not exists kit_ready_by uuid references public.profiles(id) on delete set null;

update public.students
set kit_ready = true,
    kit_ready_at = coalesce(kit_ready_at, kit_delivered_at, updated_at),
    kit_ready_by = coalesce(kit_ready_by, kit_delivered_by)
where kit_received = true;

comment on column public.students.kit_ready is
  'True once the enrollment T-Shirt and bag are prepared and ready for teacher delivery.';

comment on column public.students.kit_ready_at is
  'Date and time the enrollment T-Shirt and bag were marked ready.';

comment on column public.students.kit_ready_by is
  'Director or staff member who marked the enrollment T-Shirt and bag ready.';
