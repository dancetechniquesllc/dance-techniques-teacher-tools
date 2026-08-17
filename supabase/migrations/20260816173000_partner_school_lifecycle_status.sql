alter table public.partner_schools
  add column if not exists lifecycle_status text;

update public.partner_schools
set lifecycle_status = case
  when active = false then 'former'
  when lifecycle_status in ('current', 'unassigned', 'former') then lifecycle_status
  else 'current'
end;

alter table public.partner_schools
  alter column lifecycle_status set default 'current',
  alter column lifecycle_status set not null;

alter table public.partner_schools
  drop constraint if exists partner_schools_lifecycle_status_check;

alter table public.partner_schools
  add constraint partner_schools_lifecycle_status_check
  check (lifecycle_status in ('current', 'unassigned', 'former'));

create or replace function public.sync_partner_school_lifecycle_active()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.active := new.lifecycle_status <> 'former';
  return new;
end;
$$;

drop trigger if exists partner_schools_sync_lifecycle_active on public.partner_schools;
create trigger partner_schools_sync_lifecycle_active
before insert or update of lifecycle_status on public.partner_schools
for each row execute function public.sync_partner_school_lifecycle_active();

comment on column public.partner_schools.lifecycle_status is
  'Director-managed partner-school lifecycle: current, unassigned, or former.';
