alter table public.recital_routine_group_classes
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists recital_performance_group_id uuid references public.class_recital_performance_groups(id) on delete cascade;

alter table public.recital_routine_group_classes
  drop constraint if exists recital_routine_group_classes_pkey;

update public.recital_routine_group_classes
set id = gen_random_uuid()
where id is null;

alter table public.recital_routine_group_classes
  alter column id set not null,
  add constraint recital_routine_group_classes_pkey primary key (id);

drop index if exists public.recital_one_active_group_per_class;

create unique index if not exists recital_one_active_group_per_planning_class
  on public.recital_routine_group_classes (
    coalesce(recital_performance_group_id::text, dance_class_id::text)
  );

create index if not exists recital_routine_group_classes_performance_group_idx
  on public.recital_routine_group_classes (recital_performance_group_id);

comment on column public.recital_routine_group_classes.recital_performance_group_id is
  'When present, this planner card represents one recital-only performance group within the classroom.';
