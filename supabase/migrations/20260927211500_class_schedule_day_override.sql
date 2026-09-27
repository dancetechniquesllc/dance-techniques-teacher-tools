alter table public.dance_classes
  add column if not exists schedule_day smallint
  check (schedule_day between 1 and 7);

alter table public.dance_classes
  add column if not exists schedule_period text
  check (schedule_period in ('AM', 'PM'));

comment on column public.dance_classes.schedule_day is
  'Optional class-specific dance day. When null, the class inherits its partner school dance day.';

comment on column public.dance_classes.schedule_period is
  'Optional class-specific AM or PM period. When null, the class inherits its partner school period.';

update public.dance_classes as dc
set schedule_day = 2,
    schedule_period = 'PM'
from public.teacher_school_assignments as tsa
join public.partner_schools as ps on ps.id = tsa.partner_school_id
where dc.teacher_school_assignment_id = tsa.id
  and lower(trim(ps.name)) = lower('Woodbridge Montessori Sachse')
  and lower(trim(dc.name)) = lower('3s');
