-- Trial Requests only require a dancer's first and last name. The remaining
-- details may be completed after the initial prospect is created.
alter table public.students
  alter column birth_date drop not null;
