-- Dance Techniques Teacher Portal foundation
-- Real student data must not be entered until the first admin account is
-- activated and the role-based access checks have been tested.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'director', 'teacher');
create type public.class_status as enum ('active', 'inactive', 'archived');
create type public.student_status as enum ('future', 'enrolled', 'inactive');
create type public.enrollment_status as enum ('trial', 'enrolled', 'withdrawn');
create type public.gender_option as enum ('female', 'male', 'not_specified');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'teacher',
  color text,
  phone text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  address text,
  city text,
  state text not null default 'TX',
  postal_code text,
  district text,
  director_name text,
  director_phone text,
  director_email text,
  dance_day smallint check (dance_day between 0 and 6),
  time_of_day text check (time_of_day in ('AM', 'PM')),
  season_start_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teacher_school_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  partner_school_id uuid not null references public.partner_schools(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, partner_school_id)
);

create table public.dance_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_school_assignment_id uuid not null references public.teacher_school_assignments(id) on delete restrict,
  name text not null,
  age_group text not null,
  level smallint not null check (level between 1 and 10),
  classroom text,
  start_time time,
  capacity smallint not null default 12 check (capacity between 1 and 100),
  status public.class_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_school_assignment_id, name)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  gender public.gender_option not null default 'not_specified',
  status public.student_status not null default 'future',
  parent_name text,
  parent_phone text,
  parent_email text,
  photo_path text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  dance_class_id uuid not null references public.dance_classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status public.enrollment_status not null default 'trial',
  trial_date date,
  enrolled_date date,
  ended_date date,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dance_class_id, student_id)
);

create unique index one_current_class_per_student
  on public.class_enrollments (student_id)
  where status in ('trial', 'enrolled');

create table public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  note text not null check (char_length(btrim(note)) > 0),
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  dance_class_id uuid references public.dance_classes(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index assignments_teacher_idx on public.teacher_school_assignments (teacher_id) where active;
create index assignments_school_idx on public.teacher_school_assignments (partner_school_id) where active;
create index classes_assignment_idx on public.dance_classes (teacher_school_assignment_id) where status = 'active';
create index enrollments_class_idx on public.class_enrollments (dance_class_id, status);
create index enrollments_student_idx on public.class_enrollments (student_id, status);
create index notes_student_idx on public.student_notes (student_id, created_at desc);
create index notifications_teacher_idx on public.teacher_notifications (teacher_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger schools_set_updated_at before update on public.partner_schools
for each row execute function public.set_updated_at();
create trigger assignments_set_updated_at before update on public.teacher_school_assignments
for each row execute function public.set_updated_at();
create trigger classes_set_updated_at before update on public.dance_classes
for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();
create trigger enrollments_set_updated_at before update on public.class_enrollments
for each row execute function public.set_updated_at();
create trigger notes_set_updated_at before update on public.student_notes
for each row execute function public.set_updated_at();

create function public.enforce_class_capacity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  class_capacity integer;
  active_roster_count integer;
begin
  if new.status not in ('trial', 'enrolled') then
    return new;
  end if;

  select capacity into class_capacity
  from public.dance_classes
  where id = new.dance_class_id
  for update;

  select count(*) into active_roster_count
  from public.class_enrollments
  where dance_class_id = new.dance_class_id
    and status in ('trial', 'enrolled')
    and id is distinct from new.id;

  if active_roster_count >= class_capacity then
    raise exception 'This class is full.';
  end if;

  return new;
end;
$$;

create trigger enrollments_enforce_capacity
before insert or update of dance_class_id, status on public.class_enrollments
for each row execute function public.enforce_class_capacity();

create function public.sync_student_status_from_enrollment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.students
  set status = case new.status
    when 'trial' then 'future'::public.student_status
    when 'enrolled' then 'enrolled'::public.student_status
    else 'inactive'::public.student_status
  end
  where id = new.student_id;
  return new;
end;
$$;

create trigger enrollments_sync_student_status
after insert or update of status on public.class_enrollments
for each row execute function public.sync_student_status_from_enrollment();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

create function public.is_director_or_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('admin', 'director')
  );
$$;

create function public.teacher_has_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_director_or_admin() or exists (
    select 1
    from public.teacher_school_assignments
    where partner_school_id = target_school_id
      and teacher_id = auth.uid()
      and active
  );
$$;

create function public.teacher_has_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_director_or_admin() or exists (
    select 1
    from public.teacher_school_assignments
    where id = target_assignment_id
      and teacher_id = auth.uid()
      and active
  );
$$;

create function public.teacher_has_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_director_or_admin() or exists (
    select 1
    from public.dance_classes dc
    join public.teacher_school_assignments tsa on tsa.id = dc.teacher_school_assignment_id
    where dc.id = target_class_id
      and tsa.teacher_id = auth.uid()
      and tsa.active
  );
$$;

create function public.teacher_has_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_director_or_admin() or exists (
    select 1
    from public.class_enrollments ce
    join public.dance_classes dc on dc.id = ce.dance_class_id
    join public.teacher_school_assignments tsa on tsa.id = dc.teacher_school_assignment_id
    where ce.student_id = target_student_id
      and ce.status in ('trial', 'enrolled')
      and tsa.teacher_id = auth.uid()
      and tsa.active
  );
$$;

create function public.protect_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not public.is_director_or_admin() then
    raise exception 'Only a director or admin may change app access or roles.';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_authority
before update on public.profiles
for each row execute function public.protect_profile_authority();

revoke all on function public.is_active_user() from public;
revoke all on function public.is_director_or_admin() from public;
revoke all on function public.teacher_has_school(uuid) from public;
revoke all on function public.teacher_has_assignment(uuid) from public;
revoke all on function public.teacher_has_class(uuid) from public;
revoke all on function public.teacher_has_student(uuid) from public;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_director_or_admin() to authenticated;
grant execute on function public.teacher_has_school(uuid) to authenticated;
grant execute on function public.teacher_has_assignment(uuid) to authenticated;
grant execute on function public.teacher_has_class(uuid) to authenticated;
grant execute on function public.teacher_has_student(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.partner_schools enable row level security;
alter table public.teacher_school_assignments enable row level security;
alter table public.dance_classes enable row level security;
alter table public.students enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.student_notes enable row level security;
alter table public.teacher_notifications enable row level security;

create policy "active users see their profile and leaders see all profiles"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_director_or_admin());

create policy "leaders manage profiles"
on public.profiles for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create policy "users update their own contact details"
on public.profiles for update to authenticated
using (id = auth.uid() and active)
with check (id = auth.uid() and active);

create policy "assigned users see partner schools"
on public.partner_schools for select to authenticated
using (public.teacher_has_school(id));

create policy "leaders manage partner schools"
on public.partner_schools for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create policy "teachers see their assignments"
on public.teacher_school_assignments for select to authenticated
using (public.is_director_or_admin() or (teacher_id = auth.uid() and active));

create policy "leaders manage assignments"
on public.teacher_school_assignments for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create policy "assigned teachers see classes"
on public.dance_classes for select to authenticated
using (public.teacher_has_assignment(teacher_school_assignment_id));

create policy "assigned teachers create classes"
on public.dance_classes for insert to authenticated
with check (public.teacher_has_assignment(teacher_school_assignment_id));

create policy "assigned teachers update classes"
on public.dance_classes for update to authenticated
using (public.teacher_has_assignment(teacher_school_assignment_id))
with check (public.teacher_has_assignment(teacher_school_assignment_id));

create policy "leaders delete classes"
on public.dance_classes for delete to authenticated
using (public.is_director_or_admin());

create policy "assigned teachers see students"
on public.students for select to authenticated
using (public.teacher_has_student(id));

create policy "active users create dancers"
on public.students for insert to authenticated
with check (public.is_active_user() and created_by = auth.uid());

create policy "assigned teachers update dancers"
on public.students for update to authenticated
using (public.teacher_has_student(id))
with check (public.teacher_has_student(id));

create policy "leaders delete dancers"
on public.students for delete to authenticated
using (public.is_director_or_admin());

create policy "assigned teachers see enrollments"
on public.class_enrollments for select to authenticated
using (public.teacher_has_class(dance_class_id));

create policy "assigned teachers create enrollments"
on public.class_enrollments for insert to authenticated
with check (public.teacher_has_class(dance_class_id) and created_by = auth.uid());

create policy "assigned teachers update enrollments"
on public.class_enrollments for update to authenticated
using (public.teacher_has_class(dance_class_id))
with check (public.teacher_has_class(dance_class_id));

create policy "leaders delete enrollments"
on public.class_enrollments for delete to authenticated
using (public.is_director_or_admin());

create policy "assigned teachers see notes"
on public.student_notes for select to authenticated
using (public.teacher_has_student(student_id));

create policy "assigned teachers create notes"
on public.student_notes for insert to authenticated
with check (public.teacher_has_student(student_id) and author_id = auth.uid());

create policy "authors and leaders update notes"
on public.student_notes for update to authenticated
using ((author_id = auth.uid() and public.teacher_has_student(student_id)) or public.is_director_or_admin())
with check ((author_id = auth.uid() and public.teacher_has_student(student_id)) or public.is_director_or_admin());

create policy "authors and leaders delete notes"
on public.student_notes for delete to authenticated
using ((author_id = auth.uid() and public.teacher_has_student(student_id)) or public.is_director_or_admin());

create policy "teachers see their notifications"
on public.teacher_notifications for select to authenticated
using (teacher_id = auth.uid() or public.is_director_or_admin());

create policy "teachers mark their notifications read"
on public.teacher_notifications for update to authenticated
using (teacher_id = auth.uid() or public.is_director_or_admin())
with check (teacher_id = auth.uid() or public.is_director_or_admin());

create policy "leaders create and delete notifications"
on public.teacher_notifications for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create view public.class_roster_summary
with (security_invoker = true)
as
select
  dc.id as dance_class_id,
  count(ce.id) filter (where ce.status = 'enrolled')::integer as enrolled_count,
  count(ce.id) filter (where ce.status = 'trial')::integer as future_dancer_count,
  dc.capacity,
  case
    when count(ce.id) filter (where ce.status = 'enrolled') > 6 then 45
    else 30
  end as duration_minutes
from public.dance_classes dc
left join public.class_enrollments ce
  on ce.dance_class_id = dc.id
  and ce.status in ('trial', 'enrolled')
group by dc.id, dc.capacity;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.partner_schools to authenticated;
grant select, insert, update, delete on public.teacher_school_assignments to authenticated;
grant select, insert, update, delete on public.dance_classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.class_enrollments to authenticated;
grant select, insert, update, delete on public.student_notes to authenticated;
grant select, insert, update, delete on public.teacher_notifications to authenticated;
grant select on public.class_roster_summary to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-photos',
  'student-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "assigned teachers view student photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'student-photos'
  and public.teacher_has_student(((storage.foldername(name))[1])::uuid)
);

create policy "assigned teachers upload student photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and public.teacher_has_student(((storage.foldername(name))[1])::uuid)
);

create policy "assigned teachers update student photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'student-photos'
  and public.teacher_has_student(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'student-photos'
  and public.teacher_has_student(((storage.foldername(name))[1])::uuid)
);

create policy "assigned teachers delete student photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'student-photos'
  and public.teacher_has_student(((storage.foldername(name))[1])::uuid)
);

comment on table public.profiles is 'Approved app users. New signups remain inactive until a director or admin approves them.';
comment on table public.partner_schools is 'Dance Techniques partner school directory and season logistics.';
comment on table public.dance_classes is 'Class setup owned by the Classes & Rosters workspace.';
comment on table public.students is 'Private dancer and future-dancer records.';
comment on table public.class_enrollments is 'Current and historical class roster membership.';
comment on table public.student_notes is 'Private teacher/director follow-up notes for a dancer.';
comment on column public.students.photo_path is 'Private storage path formatted as student-id/file-name.';
