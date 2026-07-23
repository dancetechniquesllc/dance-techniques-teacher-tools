alter table public.students
  add column if not exists kit_picked_up boolean not null default false,
  add column if not exists kit_picked_up_at timestamptz,
  add column if not exists kit_picked_up_by uuid references public.profiles(id) on delete set null,
  add column if not exists kit_pickup_notified_at timestamptz;

update public.students
set kit_picked_up = true,
    kit_picked_up_at = coalesce(kit_picked_up_at, kit_delivered_at, updated_at),
    kit_picked_up_by = coalesce(kit_picked_up_by, kit_delivered_by)
where kit_received = true;

comment on column public.students.kit_picked_up is
  'True once the assigned teacher confirms physical possession of the enrollment T-Shirt and bag.';
comment on column public.students.kit_picked_up_at is
  'Date and time the assigned teacher picked up the enrollment T-Shirt and bag.';
comment on column public.students.kit_pickup_notified_at is
  'Date and time this ready kit was included in a teacher pickup digest.';

create or replace function public.queue_daily_kit_pickup_digests()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  recipient record;
  ready_count integer;
  ready_student_ids jsonb;
begin
  for recipient in
    select tsa.teacher_id
    from public.teacher_school_assignments tsa
    where tsa.active
    group by tsa.teacher_id
  loop
    select count(distinct s.id)::integer, jsonb_agg(distinct s.id)
      into ready_count, ready_student_ids
    from public.students s
    join public.class_enrollments ce on ce.student_id = s.id and ce.status = 'enrolled'
    join public.dance_classes dc on dc.id = ce.dance_class_id and dc.status = 'active'
    join public.teacher_school_assignments tsa on tsa.id = dc.teacher_school_assignment_id and tsa.active
    where tsa.teacher_id = recipient.teacher_id
      and s.kit_ready = true
      and s.kit_picked_up = false
      and s.kit_received = false
      and s.kit_pickup_notified_at is null;

    if ready_count > 0 then
      insert into public.teacher_notifications (
        teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
      ) values (
        recipient.teacher_id,
        ready_count || ' T-Shirt order' || case when ready_count = 1 then '' else 's' end || ' to pick up',
        'You have ' || ready_count || ' T-Shirt order' || case when ready_count = 1 then '' else 's' end || ' ready to pick up.',
        'kit_pickup_digest', 'routine', '/?open=orders',
        jsonb_build_object('student_ids', ready_student_ids, 'count', ready_count), now()
      );

      update public.students
      set kit_pickup_notified_at = now()
      where id in (select jsonb_array_elements_text(ready_student_ids)::uuid);
    end if;
  end loop;
end;
$$;

revoke all on function public.queue_daily_kit_pickup_digests() from public;
revoke all on function public.queue_daily_kit_pickup_digests() from authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'daily-kit-pickup-digest';
  perform cron.schedule('daily-kit-pickup-digest', '0 23 * * *', 'select public.queue_daily_kit_pickup_digests();');
exception when undefined_table or invalid_schema_name then
  raise notice 'pg_cron is unavailable; schedule queue_daily_kit_pickup_digests for 6:00 PM America/Chicago.';
end;
$$;
