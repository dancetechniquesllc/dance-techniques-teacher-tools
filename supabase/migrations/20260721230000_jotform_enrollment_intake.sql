-- Jotform enrollment intake queue.
-- Incoming webhook submissions stop here until a director explicitly approves placement.

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guardians_email_unique
  on public.guardians (lower(email))
  where nullif(btrim(email), '') is not null;

create table if not exists public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (student_id, guardian_id)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'jotform' check (source in ('jotform', 'csv_backfill')),
  source_record_id text not null,
  jotform_form_id text,
  jotform_submission_id text unique,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'placed', 'archived', 'needs_follow_up')),
  raw_submission jsonb not null,
  submitted_at timestamptz,

  student_first_name text,
  student_last_name text,
  student_preferred_name text,
  student_birth_date date,
  student_gender text,
  student_classroom text,
  tshirt_size text,
  enrollment_history text,
  related_dancer_name text,

  parent_first_name text,
  parent_last_name text,
  parent_name text,
  parent_relationship text,
  parent_email text,
  parent_phone text,

  requested_school_name text,
  requested_class_name text,
  requested_dance_style text,
  requested_day text,
  requested_time text,
  discount_code text,
  discount_details text,
  medical_notes text,
  consent_responses jsonb not null default '{}'::jsonb,
  payment_status text not null default 'unknown'
    check (payment_status in ('unknown', 'paid', 'failed', 'refunded')),
  payment_amount numeric(10,2),
  payment_transaction_id text,
  registration_notes text,

  matched_partner_school_id uuid references public.partner_schools(id) on delete set null,
  matched_teacher_id uuid references public.profiles(id) on delete set null,
  matched_dance_class_id uuid references public.dance_classes(id) on delete set null,
  placed_student_id uuid references public.students(id) on delete set null,
  placed_guardian_id uuid references public.guardians(id) on delete set null,
  placed_class_enrollment_id uuid references public.class_enrollments(id) on delete set null,

  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  placed_at timestamptz,
  brightwheel_profile_created_at timestamptz,
  parent_invited_at timestamptz,
  invoice_sent_at timestamptz,
  enrollment_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enrollments_status_created_idx
  on public.enrollments (status, created_at desc);
create index if not exists enrollments_requested_school_idx
  on public.enrollments (requested_school_name);
create unique index if not exists enrollments_source_record_unique
  on public.enrollments (source, source_record_id)
  where source_record_id is not null;

drop trigger if exists guardians_set_updated_at on public.guardians;
create trigger guardians_set_updated_at before update on public.guardians
for each row execute function public.set_updated_at();

drop trigger if exists enrollment_intake_set_updated_at on public.enrollments;
create trigger enrollment_intake_set_updated_at before update on public.enrollments
for each row execute function public.set_updated_at();

alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.enrollments enable row level security;

create policy "leaders manage guardians"
on public.guardians for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create policy "assigned teachers see guardians"
on public.guardians for select to authenticated
using (
  exists (
    select 1 from public.student_guardians sg
    where sg.guardian_id = guardians.id
      and public.teacher_has_student(sg.student_id)
  )
);

create policy "leaders manage student guardian relationships"
on public.student_guardians for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create policy "assigned teachers see student guardian relationships"
on public.student_guardians for select to authenticated
using (public.teacher_has_student(student_id));

create policy "leaders manage enrollment intake"
on public.enrollments for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

revoke all on public.guardians from anon;
revoke all on public.student_guardians from anon;
revoke all on public.enrollments from anon;
grant select, insert, update, delete on public.guardians to authenticated;
grant select, insert, update, delete on public.student_guardians to authenticated;
grant select, update on public.enrollments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'enrollments'
  ) then
    alter publication supabase_realtime add table public.enrollments;
  end if;
end;
$$;

create or replace function public.approve_enrollment_intake(
  target_enrollment_id uuid,
  target_partner_school_id uuid,
  target_teacher_id uuid,
  target_dance_class_id uuid
)
returns public.enrollments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intake public.enrollments;
  selected_assignment_id uuid;
  resolved_student_id uuid;
  resolved_guardian_id uuid;
  resolved_class_enrollment_id uuid;
  resolved_parent_name text;
begin
  if not public.is_director_or_admin() then
    raise exception 'Only an active director or admin may place an enrollment.';
  end if;

  select * into intake
  from public.enrollments
  where id = target_enrollment_id
  for update;

  if not found then raise exception 'Enrollment submission not found.'; end if;
  if intake.status = 'placed' then return intake; end if;
  if nullif(btrim(intake.student_first_name), '') is null
     or nullif(btrim(intake.student_last_name), '') is null
     or intake.student_birth_date is null then
    raise exception 'Student first name, last name, and birthdate are required before placement.';
  end if;

  select dc.teacher_school_assignment_id into selected_assignment_id
  from public.dance_classes dc
  join public.teacher_school_assignments tsa on tsa.id = dc.teacher_school_assignment_id
  where dc.id = target_dance_class_id
    and dc.status = 'active'
    and tsa.active
    and tsa.teacher_id = target_teacher_id
    and tsa.partner_school_id = target_partner_school_id;

  if selected_assignment_id is null then
    raise exception 'The selected school, teacher, and class do not belong to the same active assignment.';
  end if;

  select id into resolved_student_id
  from public.students
  where lower(first_name) = lower(btrim(intake.student_first_name))
    and lower(last_name) = lower(btrim(intake.student_last_name))
    and birth_date = intake.student_birth_date
  order by created_at
  limit 1;

  resolved_parent_name := nullif(btrim(coalesce(
    intake.parent_name,
    concat_ws(' ', intake.parent_first_name, intake.parent_last_name)
  )), '');

  if resolved_student_id is null then
    insert into public.students (
      first_name, last_name, birth_date, gender, status,
      parent_name, parent_phone, parent_email, created_by
    ) values (
      btrim(intake.student_first_name), btrim(intake.student_last_name), intake.student_birth_date,
      case
        when lower(coalesce(intake.student_gender, '')) = 'female' then 'female'::public.gender_option
        when lower(coalesce(intake.student_gender, '')) = 'male' then 'male'::public.gender_option
        else 'not_specified'::public.gender_option
      end,
      'enrolled'::public.student_status,
      resolved_parent_name, nullif(btrim(intake.parent_phone), ''), nullif(lower(btrim(intake.parent_email)), ''), auth.uid()
    ) returning id into resolved_student_id;
  else
    update public.students set
      parent_name = coalesce(resolved_parent_name, parent_name),
      parent_phone = coalesce(nullif(btrim(intake.parent_phone), ''), parent_phone),
      parent_email = coalesce(nullif(lower(btrim(intake.parent_email)), ''), parent_email)
    where id = resolved_student_id;
  end if;

  if nullif(btrim(intake.parent_email), '') is not null then
    select id into resolved_guardian_id
    from public.guardians
    where lower(email) = lower(btrim(intake.parent_email))
    limit 1;
  end if;

  if resolved_guardian_id is null and resolved_parent_name is not null then
    insert into public.guardians (first_name, last_name, full_name, email, phone)
    values (
      nullif(btrim(intake.parent_first_name), ''), nullif(btrim(intake.parent_last_name), ''),
      resolved_parent_name, nullif(lower(btrim(intake.parent_email)), ''), nullif(btrim(intake.parent_phone), '')
    ) returning id into resolved_guardian_id;
  elsif resolved_guardian_id is not null then
    update public.guardians set
      full_name = coalesce(resolved_parent_name, full_name),
      first_name = coalesce(nullif(btrim(intake.parent_first_name), ''), first_name),
      last_name = coalesce(nullif(btrim(intake.parent_last_name), ''), last_name),
      phone = coalesce(nullif(btrim(intake.parent_phone), ''), phone)
    where id = resolved_guardian_id;
  end if;

  if resolved_guardian_id is not null then
    insert into public.student_guardians (student_id, guardian_id, relationship, is_primary)
    values (resolved_student_id, resolved_guardian_id, nullif(btrim(intake.parent_relationship), ''), true)
    on conflict (student_id, guardian_id) do update set
      relationship = excluded.relationship,
      is_primary = true;
  end if;

  select id into resolved_class_enrollment_id
  from public.class_enrollments
  where student_id = resolved_student_id
    and status in ('trial', 'enrolled')
  order by created_at desc
  limit 1
  for update;

  if resolved_class_enrollment_id is null then
    insert into public.class_enrollments (
      dance_class_id, student_id, status, enrolled_date, created_by
    ) values (
      target_dance_class_id, resolved_student_id, 'enrolled', current_date, auth.uid()
    )
    on conflict (dance_class_id, student_id) do update set
      status = 'enrolled', enrolled_date = coalesce(public.class_enrollments.enrolled_date, current_date), ended_date = null
    returning id into resolved_class_enrollment_id;
  else
    update public.class_enrollments set
      dance_class_id = target_dance_class_id,
      status = 'enrolled',
      enrolled_date = coalesce(enrolled_date, current_date),
      ended_date = null
    where id = resolved_class_enrollment_id;
  end if;

  update public.enrollments set
    status = 'placed',
    matched_partner_school_id = target_partner_school_id,
    matched_teacher_id = target_teacher_id,
    matched_dance_class_id = target_dance_class_id,
    placed_student_id = resolved_student_id,
    placed_guardian_id = resolved_guardian_id,
    placed_class_enrollment_id = resolved_class_enrollment_id,
    reviewed_by = auth.uid(),
    reviewed_at = coalesce(reviewed_at, now()),
    placed_at = now()
  where id = target_enrollment_id
  returning * into intake;

  return intake;
end;
$$;

revoke all on function public.approve_enrollment_intake(uuid, uuid, uuid, uuid) from public;
grant execute on function public.approve_enrollment_intake(uuid, uuid, uuid, uuid) to authenticated;

comment on table public.enrollments is
  'Staging queue for Jotform registration submissions. No student or roster record is created until director approval.';
