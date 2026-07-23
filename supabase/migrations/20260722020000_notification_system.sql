-- Role-aware notification center, personal push preferences, device
-- subscriptions, and provisional same-day enrollment acknowledgements.

alter table public.teacher_notifications
  add column if not exists notification_type text not null default 'general',
  add column if not exists priority text not null default 'routine'
    check (priority in ('routine', 'urgent')),
  add column if not exists action_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists push_requested_at timestamptz,
  add column if not exists push_sent_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists expires_at timestamptz default (now() + interval '90 days');

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '20:00',
  quiet_hours_end time not null default '07:00',
  timezone text not null default 'America/Chicago',
  messages_push boolean not null default true,
  roster_updates_push boolean not null default true,
  schedule_changes_push boolean not null default true,
  curriculum_music_push boolean not null default true,
  urgent_bypass_quiet_hours boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.enrollments
  add column if not exists provisional_included_at timestamptz,
  add column if not exists provisional_included_by uuid references public.profiles(id) on delete set null;

update public.partner_schools set dance_day = 1, time_of_day = 'AM' where lower(name) = lower('Primrose School of North Rockwall') and dance_day is null;
update public.partner_schools set dance_day = 2, time_of_day = 'PM' where lower(name) = lower('Primrose School of Rockwall') and dance_day is null;
update public.partner_schools set dance_day = 4, time_of_day = 'AM' where lower(name) = lower('Primrose School of Rowlett') and dance_day is null;
update public.partner_schools set dance_day = 5, time_of_day = 'AM' where lower(name) = lower('Highview Learning Center') and dance_day is null;

create index if not exists notification_unread_idx
  on public.teacher_notifications (teacher_id, created_at desc)
  where read_at is null and dismissed_at is null;
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id) where active;

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "users manage their notification preferences"
on public.notification_preferences for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users manage their push devices"
on public.push_subscriptions for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function public.acknowledge_provisional_enrollment(target_enrollment_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intake public.enrollments;
  school_id uuid;
  result public.enrollments;
begin
  select * into intake from public.enrollments where id = target_enrollment_id for update;
  if intake.id is null then raise exception 'Enrollment not found'; end if;

  select id into school_id
  from public.partner_schools
  where active and lower(regexp_replace(name, '\\W+', '', 'g')) = lower(regexp_replace(intake.requested_school_name, '\\W+', '', 'g'))
  limit 1;

  if not public.is_director_or_admin() and not exists (
    select 1 from public.teacher_school_assignments
    where teacher_id = auth.uid() and partner_school_id = school_id and active
  ) then
    raise exception 'This enrollment is not assigned to your school';
  end if;

  update public.enrollments
  set provisional_included_at = coalesce(provisional_included_at, now()),
      provisional_included_by = coalesce(provisional_included_by, auth.uid()),
      updated_at = now()
  where id = target_enrollment_id
  returning * into result;

  insert into public.teacher_notifications (
    teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
  )
  select p.id,
         'Dancer included in class',
         concat_ws(' ', intake.student_first_name, intake.student_last_name) || ' was included before final roster approval.',
         'provisional_acknowledged', 'urgent',
         '/?open=enrollment&id=' || intake.id,
         jsonb_build_object('enrollment_id', intake.id, 'acknowledged_by', auth.uid()),
         now()
  from public.profiles p
  where p.active and p.role in ('admin', 'director');

  return result;
end;
$$;

revoke all on function public.acknowledge_provisional_enrollment(uuid) from public;
grant execute on function public.acknowledge_provisional_enrollment(uuid) to authenticated;

create or replace function public.notify_new_enrollment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  school_record public.partner_schools;
  is_dance_day boolean := false;
  dancer_name text := btrim(concat_ws(' ', new.student_first_name, new.student_last_name));
begin
  select * into school_record
  from public.partner_schools
  where active and (
    lower(regexp_replace(name, '\\W+', '', 'g')) = lower(regexp_replace(new.requested_school_name, '\\W+', '', 'g'))
    or lower(regexp_replace(coalesce(nickname, ''), '\\W+', '', 'g')) = lower(regexp_replace(new.requested_school_name, '\\W+', '', 'g'))
  )
  limit 1;

  is_dance_day := school_record.id is not null
    and school_record.dance_day = extract(dow from timezone('America/Chicago', coalesce(new.submitted_at, new.created_at)));

  insert into public.teacher_notifications (
    teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
  )
  select p.id,
         case when is_dance_day then 'New dance-day enrollment' else 'New enrollment' end,
         coalesce(nullif(dancer_name, ''), 'A new dancer') || ' enrolled for ' || coalesce(new.requested_school_name, 'a partner school') || '.',
         case when is_dance_day then 'same_day_enrollment' else 'new_enrollment' end,
         case when is_dance_day then 'urgent' else 'routine' end,
         '/?open=enrollment&id=' || new.id,
         jsonb_build_object('enrollment_id', new.id, 'school_id', school_record.id),
         case when is_dance_day then now() else null end
  from public.profiles p
  where p.active and p.role in ('admin', 'director');

  if new.payment_status <> 'paid' then
    insert into public.teacher_notifications (
      teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
    )
    select p.id,
           'Enrollment fee needs attention',
           coalesce(nullif(dancer_name, ''), 'A new dancer') || ' has an unpaid or unsuccessful enrollment fee.',
           'unpaid_enrollment_fee', 'routine',
           '/?open=enrollment&id=' || new.id,
           jsonb_build_object('enrollment_id', new.id, 'payment_status', new.payment_status),
           now()
    from public.profiles p
    where p.active and p.role in ('admin', 'director');
  end if;

  if is_dance_day then
    insert into public.teacher_notifications (
      teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
    )
    select assignment.teacher_id,
           'New dancer for today',
           coalesce(nullif(dancer_name, ''), 'A new dancer') || ' enrolled for ' || school_record.name || ' today.',
           'same_day_enrollment', 'urgent',
           '/?open=notifications',
           jsonb_build_object(
             'enrollment_id', new.id,
             'student_first_name', new.student_first_name,
             'student_last_name', new.student_last_name,
             'student_birth_date', new.student_birth_date,
             'student_classroom', new.student_classroom,
             'requested_school_name', new.requested_school_name,
             'medical_notes', new.medical_notes
           ),
           now()
    from public.teacher_school_assignments assignment
    where assignment.partner_school_id = school_record.id and assignment.active;
  end if;

  return new;
end;
$$;

drop trigger if exists enrollment_notification_intake on public.enrollments;
create trigger enrollment_notification_intake
after insert on public.enrollments
for each row when (new.status = 'new') execute function public.notify_new_enrollment();

revoke all on function public.notify_new_enrollment() from public;

create or replace function public.queue_hourly_enrollment_digests()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  recipient record;
  pending_count integer;
  source_ids jsonb;
begin
  for recipient in select id from public.profiles where active and role in ('admin', 'director') loop
    select count(*)::integer, jsonb_agg(id)
      into pending_count, source_ids
    from public.teacher_notifications
    where teacher_id = recipient.id
      and notification_type = 'new_enrollment'
      and push_requested_at is null
      and not (metadata ? 'included_in_digest_at')
      and created_at >= now() - interval '24 hours';

    if pending_count > 0 then
      insert into public.teacher_notifications (
        teacher_id, title, message, notification_type, priority, action_url, metadata, push_requested_at
      ) values (
        recipient.id,
        pending_count || ' new enrollment' || case when pending_count = 1 then '' else 's' end,
        'New enrollments are ready for your review.',
        'enrollment_digest', 'routine', '/?open=enrollments',
        jsonb_build_object('source_notification_ids', source_ids, 'count', pending_count), now()
      );

      update public.teacher_notifications
      set metadata = metadata || jsonb_build_object('included_in_digest_at', now())
      where id in (select jsonb_array_elements_text(source_ids)::uuid);
    end if;
  end loop;
end;
$$;

revoke all on function public.queue_hourly_enrollment_digests() from public;
revoke all on function public.queue_hourly_enrollment_digests() from authenticated;

-- Supabase Cron runs the grouped director enrollment reminder at the top of
-- every hour. Same-day enrollments bypass this queue and request push at once.
create extension if not exists pg_cron with schema extensions;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'hourly-enrollment-notification-digest';
  perform cron.schedule('hourly-enrollment-notification-digest', '0 * * * *', 'select public.queue_hourly_enrollment_digests();');
exception when undefined_table or invalid_schema_name then
  raise notice 'pg_cron is not available yet; schedule queue_hourly_enrollment_digests hourly in Supabase Cron.';
end;
$$;
