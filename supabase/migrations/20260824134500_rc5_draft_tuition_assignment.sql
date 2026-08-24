-- Prepare RC5 family billing without charging anyone or choosing the family's
-- Recital Experience payment option. Parents make that choice during setup.

alter table public.student_tuition_plans
  alter column recital_payment_option drop not null;
alter table public.student_tuition_plans
  drop constraint if exists student_tuition_plans_recital_payment_option_check;
alter table public.student_tuition_plans
  add constraint student_tuition_plans_recital_payment_option_check
  check (
    recital_payment_option is null
    or recital_payment_option in ('paid_at_enrollment', 'installments_through_jan_1', 'january_full')
  );

comment on column public.student_tuition_plans.recital_payment_option is
  'Null means the family has not chosen its Recital Experience payment option in Parent Portal yet.';

create or replace function public.assign_rowlett_class_5_draft_tuition_plans()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate record;
  primary_guardian record;
  billing_account_id uuid;
  tuition_type text;
  legacy_discount text;
  assigned_count integer := 0;
  skipped_count integer := 0;
  failure_count integer := 0;
  failures jsonb := '[]'::jsonb;
begin
  if not public.is_director_or_admin() then
    raise exception 'Director or administrator access required.' using errcode = '42501';
  end if;

  for candidate in
    select distinct student.id, student.first_name, student.last_name, student.tuition_discount
    from public.students student
    join public.class_enrollments enrollment on enrollment.student_id = student.id
    join public.dance_classes dance_class on dance_class.id = enrollment.dance_class_id
    join public.teacher_school_assignments assignment on assignment.id = dance_class.teacher_school_assignment_id
    join public.partner_schools school on school.id = assignment.partner_school_id
    where enrollment.status in ('trial', 'enrolled')
      and dance_class.status = 'active'
      and assignment.active
      and school.active
      and lower(btrim(school.name)) = 'primrose school of rowlett'
      and (lower(btrim(dance_class.name)) = 'class 5' or lower(btrim(coalesce(dance_class.classroom, ''))) = 'class 5')
      and coalesce(enrollment.enrolled_date, date '2026-09-01') <= date '2027-05-31'
      and (enrollment.ended_date is null or enrollment.ended_date >= date '2026-09-01')
    order by student.last_name, student.first_name
  loop
    if exists (
      select 1 from public.student_tuition_plans plan
      where plan.student_id = candidate.id and plan.status in ('draft', 'active')
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select guardian.id, guardian.email
      into primary_guardian
    from public.student_guardians link
    join public.guardians guardian on guardian.id = link.guardian_id
    where link.student_id = candidate.id and link.is_primary
    order by link.created_at
    limit 1;

    if primary_guardian.id is null then
      failure_count := failure_count + 1;
      failures := failures || jsonb_build_array(jsonb_build_object(
        'student_id', candidate.id,
        'student_name', btrim(candidate.first_name || ' ' || candidate.last_name),
        'reason', 'Missing linked primary adult'
      ));
      continue;
    end if;

    if nullif(btrim(coalesce(primary_guardian.email, '')), '') is null
       or primary_guardian.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      failure_count := failure_count + 1;
      failures := failures || jsonb_build_array(jsonb_build_object(
        'student_id', candidate.id,
        'student_name', btrim(candidate.first_name || ' ' || candidate.last_name),
        'reason', 'Missing or invalid primary adult email'
      ));
      continue;
    end if;

    insert into public.family_billing_accounts (guardian_id, autopay_required, payment_method_status, created_by, updated_by)
    values (primary_guardian.id, true, 'not_connected', auth.uid(), auth.uid())
    on conflict (guardian_id) do update set updated_by = auth.uid(), updated_at = now()
    returning id into billing_account_id;

    tuition_type := case candidate.tuition_discount
      when 'sibling' then 'sibling'
      when 'staff' then 'school_staff'
      when 'director' then 'director'
      else 'tuition'
    end;
    legacy_discount := case candidate.tuition_discount
      when 'sibling' then 'teacher'
      when 'staff' then 'staff'
      when 'director' then 'director'
      else 'standard'
    end;

    insert into public.student_tuition_plans (
      student_id, billing_account_id, starts_on, ends_on, discount_category,
      billing_tuition_type, recital_payment_option, status, notes, created_by, updated_by
    ) values (
      candidate.id, billing_account_id, date '2026-09-01', date '2027-05-31', legacy_discount,
      tuition_type, null, 'draft', 'RC5 2026-2027 setup; parent selects Recital Experience option in Parent Portal.', auth.uid(), auth.uid()
    );
    assigned_count := assigned_count + 1;
  end loop;

  return jsonb_build_object(
    'assigned', assigned_count,
    'skipped_existing', skipped_count,
    'failed', failure_count,
    'failures', failures,
    'charging_enabled', false,
    'recital_selection', 'pending_parent_choice'
  );
end;
$$;

revoke all on function public.assign_rowlett_class_5_draft_tuition_plans() from public;
grant execute on function public.assign_rowlett_class_5_draft_tuition_plans() to authenticated;

comment on function public.assign_rowlett_class_5_draft_tuition_plans() is
  'Idempotently assigns non-charging Sep-May draft tuition plans to eligible RC5 dancers and reports readiness failures.';
