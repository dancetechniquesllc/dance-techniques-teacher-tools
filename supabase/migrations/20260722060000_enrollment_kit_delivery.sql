alter table public.students
  add column if not exists kit_delivered_at timestamptz,
  add column if not exists kit_delivered_by uuid references public.profiles(id) on delete set null;

comment on column public.students.kit_received is
  'True after the student receives their enrollment T-Shirt and bag together.';

comment on column public.students.kit_delivered_at is
  'Date and time the enrollment T-Shirt and bag were delivered.';

comment on column public.students.kit_delivered_by is
  'Teacher or director who confirmed delivery of the enrollment T-Shirt and bag.';
