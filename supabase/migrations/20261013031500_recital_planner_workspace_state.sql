create table if not exists public.recital_planner_workspace_states (
  season text primary key,
  workspace_state jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.recital_planner_workspace_states enable row level security;

drop policy if exists "leaders manage recital planner workspace" on public.recital_planner_workspace_states;
create policy "leaders manage recital planner workspace"
on public.recital_planner_workspace_states for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

grant select, insert, update, delete on public.recital_planner_workspace_states to authenticated;

comment on table public.recital_planner_workspace_states is
  'Explicit Save Work snapshots for the complete teacher recital-planning workspace.';
