-- Keep the database capacity rule aligned with the Director Dashboard.
-- Tots/Level 1 classes are intentionally capped at eight dancers.
update public.dance_classes
set capacity = 8
where lower(btrim(age_group)) in ('tots', '2s', 'young 2s', 'under 3')
   or lower(btrim(name)) ~ '(^|[^a-z])tots?([^a-z]|$)';

create or replace function public.enforce_class_capacity()
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

  select case
    when lower(btrim(age_group)) in ('tots', '2s', 'young 2s', 'under 3')
      or lower(btrim(name)) ~ '(^|[^a-z])tots?([^a-z]|$)'
      then 8
    else capacity
  end
  into class_capacity
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
