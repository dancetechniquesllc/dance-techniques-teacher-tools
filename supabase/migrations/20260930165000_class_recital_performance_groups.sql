create table if not exists public.class_recital_performance_groups (
  id uuid primary key default gen_random_uuid(),
  dance_class_id uuid not null references public.dance_classes(id) on delete cascade,
  name text not null,
  position smallint not null default 1 check (position > 0),
  tone text not null default 'blush' check (tone in ('blush','sage','blue','gold','lavender')),
  recital_requirement text not null default 'either' check (recital_requirement in ('ballet','tap','either')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dance_class_id, position)
);

create table if not exists public.class_recital_performance_group_members (
  group_id uuid not null references public.class_recital_performance_groups(id) on delete cascade,
  dance_class_id uuid not null references public.dance_classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, student_id),
  unique (dance_class_id, student_id)
);

create index if not exists class_recital_groups_class_idx
  on public.class_recital_performance_groups (dance_class_id, position);
create index if not exists class_recital_group_members_class_idx
  on public.class_recital_performance_group_members (dance_class_id, group_id);

drop trigger if exists class_recital_groups_set_updated_at on public.class_recital_performance_groups;
create trigger class_recital_groups_set_updated_at before update on public.class_recital_performance_groups
for each row execute function public.set_updated_at();
drop trigger if exists class_recital_group_members_set_updated_at on public.class_recital_performance_group_members;
create trigger class_recital_group_members_set_updated_at before update on public.class_recital_performance_group_members
for each row execute function public.set_updated_at();

alter table public.class_recital_performance_groups enable row level security;
alter table public.class_recital_performance_group_members enable row level security;

drop policy if exists "leaders manage class recital groups" on public.class_recital_performance_groups;
create policy "leaders manage class recital groups"
on public.class_recital_performance_groups for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

drop policy if exists "leaders manage class recital group members" on public.class_recital_performance_group_members;
create policy "leaders manage class recital group members"
on public.class_recital_performance_group_members for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

grant select, insert, update, delete on public.class_recital_performance_groups to authenticated;
grant select, insert, update, delete on public.class_recital_performance_group_members to authenticated;

comment on table public.class_recital_performance_groups is 'Director-only recital overlays for dancers within one official dance class.';
comment on table public.class_recital_performance_group_members is 'Exactly one recital performance group per enrolled dancer and class; classroom assignments remain unchanged.';
