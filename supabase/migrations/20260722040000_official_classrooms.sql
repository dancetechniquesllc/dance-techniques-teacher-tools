alter table public.partner_schools
  add column if not exists classroom_options text[] not null default '{}';

alter table public.enrollments
  add column if not exists official_classroom text;

alter table public.students
  add column if not exists official_classroom text;

comment on column public.partner_schools.classroom_options is
  'Director-managed official classroom dropdown options for this school.';

comment on column public.enrollments.official_classroom is
  'Director-selected standardized classroom; student_classroom preserves the original Jotform response.';

comment on column public.students.official_classroom is
  'Standardized classroom used for roster grouping and attendance.';
