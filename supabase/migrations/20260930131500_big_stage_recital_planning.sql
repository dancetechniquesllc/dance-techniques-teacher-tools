create table if not exists public.recital_routine_groups (
  id uuid primary key default gen_random_uuid(),
  season text not null default '2027',
  name text not null,
  recital_requirement text not null default 'either' check (recital_requirement in ('ballet','tap','either','other')),
  relationship_type text not null default 'share' check (relationship_type in ('combine','share','separate')),
  match_quality text not null default 'possible' check (match_quality in ('strong','good','possible','manual')),
  decision_state text not null default 'suggested' check (decision_state in ('suggested','approved','modified','locked','rejected')),
  routine_owner_type text not null default 'lead_teacher' check (routine_owner_type in ('lead_teacher','shared','dt_standard')),
  lead_teacher_id uuid references public.profiles(id) on delete set null,
  cross_teacher boolean not null default false,
  analysis jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recital_routine_group_classes (
  group_id uuid not null references public.recital_routine_groups(id) on delete cascade,
  dance_class_id uuid not null references public.dance_classes(id) on delete cascade,
  stage_group_key text,
  show_number smallint check (show_number between 1 and 4),
  class_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, dance_class_id)
);

create unique index if not exists recital_one_active_group_per_class
  on public.recital_routine_group_classes (dance_class_id);
create index if not exists recital_groups_season_idx
  on public.recital_routine_groups (season, decision_state);
create index if not exists recital_group_classes_show_idx
  on public.recital_routine_group_classes (show_number);

drop trigger if exists recital_routine_groups_set_updated_at on public.recital_routine_groups;
create trigger recital_routine_groups_set_updated_at before update on public.recital_routine_groups
for each row execute function public.set_updated_at();
drop trigger if exists recital_routine_group_classes_set_updated_at on public.recital_routine_group_classes;
create trigger recital_routine_group_classes_set_updated_at before update on public.recital_routine_group_classes
for each row execute function public.set_updated_at();

alter table public.recital_routine_groups enable row level security;
alter table public.recital_routine_group_classes enable row level security;

drop policy if exists "leaders manage recital routine groups" on public.recital_routine_groups;
create policy "leaders manage recital routine groups"
on public.recital_routine_groups for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

drop policy if exists "teachers view their recital routine groups" on public.recital_routine_groups;

drop policy if exists "leaders manage recital routine classes" on public.recital_routine_group_classes;
create policy "leaders manage recital routine classes"
on public.recital_routine_group_classes for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

drop policy if exists "teachers view their recital routine classes" on public.recital_routine_group_classes;

grant select, insert, update, delete on public.recital_routine_groups to authenticated;
grant select, insert, update, delete on public.recital_routine_group_classes to authenticated;

comment on table public.recital_routine_groups is 'Director-reviewed Big Stage choreography groups for one recital season.';
comment on column public.recital_routine_groups.decision_state is 'Suggested, director-approved, modified, locked, or rejected; locked groups survive recalculation.';
comment on column public.recital_routine_group_classes.stage_group_key is 'Classes sharing a key perform together as one number; classes with different keys share choreography but perform separately.';
