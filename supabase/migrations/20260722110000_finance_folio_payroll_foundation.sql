-- Finance Folio payroll foundation
-- Additive only: existing student, enrollment, class, school, and teacher records remain authoritative.

create table if not exists public.payroll_rate_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  effective_from date not null,
  effective_to date,
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.teacher_payment_tier_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  payment_tier text not null check (payment_tier in (
    'tier_a_founding_teacher', 'tier_b_teacher', 'tier_c_administrator', 'tier_d_director'
  )),
  effective_from date not null,
  effective_to date,
  rate_version_id uuid references public.payroll_rate_versions(id) on delete restrict,
  pay_stub_eligible boolean not null default true,
  payroll_eligible boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (teacher_id, effective_from)
);

alter table public.students
  add column if not exists tuition_discount text not null default 'none';

alter table public.students drop constraint if exists students_tuition_discount_check;
alter table public.students add constraint students_tuition_discount_check
  check (tuition_discount in ('none', 'sibling', 'staff', 'director'));

alter table public.enrollments
  add column if not exists tuition_discount text;

alter table public.enrollments drop constraint if exists enrollments_tuition_discount_check;
alter table public.enrollments add constraint enrollments_tuition_discount_check
  check (tuition_discount is null or tuition_discount in ('none', 'sibling', 'staff', 'director'));

create or replace function public.normalized_tuition_discount(code text, details text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%director%' then 'director'
    when lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%staff%' then 'staff'
    when lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%sibling%' then 'sibling'
    else 'none'
  end
$$;

update public.enrollments
set tuition_discount = public.normalized_tuition_discount(discount_code, discount_details)
where tuition_discount is null;

create or replace function public.sync_enrollment_discount_to_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.placed_student_id is not null then
    update public.students
    set tuition_discount = coalesce(
      new.tuition_discount,
      public.normalized_tuition_discount(new.discount_code, new.discount_details),
      'none'
    )
    where id = new.placed_student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists enrollments_sync_tuition_discount on public.enrollments;
create trigger enrollments_sync_tuition_discount
after insert or update of placed_student_id, tuition_discount, discount_code, discount_details
on public.enrollments
for each row execute function public.sync_enrollment_discount_to_student();

create table if not exists public.class_occurrences (
  id uuid primary key default gen_random_uuid(),
  dance_class_id uuid not null references public.dance_classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  partner_school_id uuid not null references public.partner_schools(id) on delete restrict,
  occurrence_date date not null,
  start_time time,
  occurrence_type text not null default 'scheduled' check (occurrence_type in (
    'scheduled', 'makeup', 'isd_closure'
  )),
  status text not null default 'scheduled' check (status in (
    'scheduled', 'completed', 'cancelled', 'rescheduled'
  )),
  original_occurrence_id uuid references public.class_occurrences(id) on delete restrict,
  replacement_occurrence_id uuid references public.class_occurrences(id) on delete restrict,
  active_student_count integer check (active_student_count is null or active_student_count >= 0),
  payroll_treatment text not null default 'pending' check (payroll_treatment in (
    'pending', 'payable', 'excluded', 'closure_pay'
  )),
  payroll_reason text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dance_class_id, occurrence_date, occurrence_type)
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  payday date not null,
  payment_sequence smallint not null check (payment_sequence in (1, 2)),
  calculation_deadline date not null,
  status text not null default 'not_started' check (status in (
    'not_started', 'in_progress', 'needs_review', 'approved', 'paid', 'reopened'
  )),
  estimated_total numeric(12,2) not null default 0,
  unresolved_issue_count integer not null default 0,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  locked_snapshot jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payday),
  unique (period_month, payment_sequence)
);

create table if not exists public.student_billing_months (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  billing_month date not null,
  payment_status text not null default 'paid' check (payment_status in (
    'paid', 'outstanding', 'cleared'
  )),
  outstanding_amount numeric(10,2) check (outstanding_amount is null or outstanding_amount >= 0),
  marked_outstanding_at timestamptz,
  balance_cleared_date date,
  late_fee_paid boolean not null default false,
  late_fee_paid_date date,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, billing_month)
);

create table if not exists public.teacher_work_hours (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  description text not null,
  rate numeric(10,2) not null default 20,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  entered_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_teacher_summaries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  payment_tier text not null,
  gross_earned numeric(12,2) not null default 0,
  held_amount numeric(12,2) not null default 0,
  released_amount numeric(12,2) not null default 0,
  adjustment_amount numeric(12,2) not null default 0,
  prior_payment_amount numeric(12,2) not null default 0,
  negative_balance_applied numeric(12,2) not null default 0,
  payment_due numeric(12,2) not null default 0,
  carry_forward_balance numeric(12,2) not null default 0,
  issue_count integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'finalized', 'paid')),
  calculation_snapshot jsonb not null default '{}'::jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, teacher_id)
);

create table if not exists public.payroll_line_items (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.payroll_teacher_summaries(id) on delete cascade,
  line_type text not null check (line_type in (
    'student_pay', 'class_pay', 'closure_pay', 'working_hours', 'commission',
    'active_student_bonus', 'late_fee_bonus', 'hold', 'hold_release',
    'manual_adjustment', 'negative_balance'
  )),
  student_id uuid references public.students(id) on delete restrict,
  dance_class_id uuid references public.dance_classes(id) on delete restrict,
  class_occurrence_id uuid references public.class_occurrences(id) on delete restrict,
  school_id uuid references public.partner_schools(id) on delete restrict,
  source_teacher_id uuid references public.profiles(id) on delete restrict,
  description text not null,
  quantity numeric(10,2) not null default 1,
  rate numeric(10,2) not null default 0,
  amount numeric(12,2) not null,
  payable boolean not null default true,
  exclusion_reason text,
  prorated boolean not null default false,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_holds (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  billing_month date not null,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  source_line_item_id uuid references public.payroll_line_items(id) on delete set null,
  original_amount numeric(12,2) not null check (original_amount >= 0),
  status text not null default 'held' check (status in ('held', 'released', 'rolled_forward')),
  held_at timestamptz not null default now(),
  balance_cleared_date date,
  release_payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  released_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.payroll_teacher_summaries(id) on delete cascade,
  amount numeric(12,2) not null,
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_payment_records (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null unique references public.payroll_teacher_summaries(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null default 'direct_deposit',
  paid_date date not null,
  reference text,
  recorded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_pay_stubs (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null unique references public.payroll_teacher_summaries(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  file_path text,
  generated_snapshot jsonb not null default '{}'::jsonb,
  finalized boolean not null default false,
  generated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists public.payroll_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payroll_tier_teacher_dates_idx on public.teacher_payment_tier_assignments (teacher_id, effective_from desc);
create index if not exists class_occurrences_date_idx on public.class_occurrences (occurrence_date, teacher_id);
create index if not exists billing_month_status_idx on public.student_billing_months (billing_month, payment_status);
create index if not exists payroll_summaries_teacher_idx on public.payroll_teacher_summaries (teacher_id, payroll_period_id);
create index if not exists payroll_lines_summary_type_idx on public.payroll_line_items (summary_id, line_type);
create index if not exists payroll_holds_student_status_idx on public.payroll_holds (student_id, status);

drop trigger if exists payroll_rate_versions_set_updated_at on public.payroll_rate_versions;
create trigger payroll_rate_versions_set_updated_at before update on public.payroll_rate_versions
for each row execute function public.set_updated_at();
drop trigger if exists payment_tiers_set_updated_at on public.teacher_payment_tier_assignments;
create trigger payment_tiers_set_updated_at before update on public.teacher_payment_tier_assignments
for each row execute function public.set_updated_at();
drop trigger if exists class_occurrences_set_updated_at on public.class_occurrences;
create trigger class_occurrences_set_updated_at before update on public.class_occurrences
for each row execute function public.set_updated_at();
drop trigger if exists payroll_periods_set_updated_at on public.payroll_periods;
create trigger payroll_periods_set_updated_at before update on public.payroll_periods
for each row execute function public.set_updated_at();
drop trigger if exists student_billing_months_set_updated_at on public.student_billing_months;
create trigger student_billing_months_set_updated_at before update on public.student_billing_months
for each row execute function public.set_updated_at();
drop trigger if exists teacher_work_hours_set_updated_at on public.teacher_work_hours;
create trigger teacher_work_hours_set_updated_at before update on public.teacher_work_hours
for each row execute function public.set_updated_at();
drop trigger if exists payroll_summaries_set_updated_at on public.payroll_teacher_summaries;
create trigger payroll_summaries_set_updated_at before update on public.payroll_teacher_summaries
for each row execute function public.set_updated_at();
drop trigger if exists payroll_holds_set_updated_at on public.payroll_holds;
create trigger payroll_holds_set_updated_at before update on public.payroll_holds
for each row execute function public.set_updated_at();

insert into public.payroll_rate_versions (name, effective_from, rules)
select 'Dance Techniques payroll rules - June 2026', date '2026-06-01', jsonb_build_object(
  'tuition', jsonb_build_object('regular', 55, 'sibling', 45, 'staff', 45, 'director', 0),
  'tier_a', jsonb_build_object('full_per_class', 10, 'full_monthly_cap', 40, 'discount_per_class', 7.5, 'discount_monthly_cap', 30),
  'tier_b', jsonb_build_object('class_rates', jsonb_build_object('0_6', 20, '7', 30, '8', 33, '9', 36, '10', 39, '11', 42, '12_plus', 45), 'closure_rate', 20, 'working_hour_rate', 20),
  'tier_c', jsonb_build_object('own_standard_full', 52, 'own_standard_discount', 42, 'own_vendor_full', 46.8, 'own_vendor_discount', 37.8, 'founding_commission_full', 5, 'founding_commission_discount', 4, 'teacher_commission_per_class', 15, 'active_student_bonus', 1, 'late_fee_paid_bonus', 2),
  'tier_d', jsonb_build_object('own_standard_full', 52, 'own_standard_discount', 42, 'own_vendor_full', 46.8, 'own_vendor_discount', 37.8, 'founding_commission_full', 5, 'founding_commission_discount', 4, 'teacher_commission_per_class', 15, 'active_student_bonus', 0, 'late_fee_paid_bonus', 2),
  'policy', jsonb_build_object('first_payment_fraction', 0.5, 'tier_a_monthly_class_cap', 4, 'fifth_class_requires_unpaid_makeup', true, 'director_discount_counts_for_class_size', false)
)
where not exists (select 1 from public.payroll_rate_versions where effective_from = date '2026-06-01');

create or replace function public.ensure_payroll_periods(target_month date)
returns setof public.payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', target_month)::date;
  first_payday date := month_start;
  second_payday date := month_start + 14;
begin
  if not public.is_director_or_admin() then
    raise exception 'Director or administrator access required';
  end if;
  insert into public.payroll_periods (period_month, payday, payment_sequence, calculation_deadline)
  values
    (month_start, first_payday, 1, first_payday - 5),
    (month_start, second_payday, 2, second_payday - 5)
  on conflict (period_month, payment_sequence) do nothing;
  return query select * from public.payroll_periods where period_month = month_start order by payment_sequence;
end;
$$;

create or replace function public.set_teacher_payment_tier(
  target_teacher_id uuid,
  target_payment_tier text,
  target_effective_from date default current_date
)
returns public.teacher_payment_tier_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.teacher_payment_tier_assignments;
  current_rate_version uuid;
begin
  if not public.is_director_or_admin() then
    raise exception 'Director or administrator access required';
  end if;
  if target_payment_tier not in ('tier_a_founding_teacher', 'tier_b_teacher', 'tier_c_administrator', 'tier_d_director') then
    raise exception 'Invalid payment tier';
  end if;
  select id into current_rate_version from public.payroll_rate_versions
  where active and effective_from <= target_effective_from and (effective_to is null or effective_to >= target_effective_from)
  order by effective_from desc limit 1;
  update public.teacher_payment_tier_assignments
  set effective_to = target_effective_from - 1
  where teacher_id = target_teacher_id and effective_from < target_effective_from
    and (effective_to is null or effective_to >= target_effective_from);
  insert into public.teacher_payment_tier_assignments (
    teacher_id, payment_tier, effective_from, rate_version_id, pay_stub_eligible, payroll_eligible
  ) values (
    target_teacher_id, target_payment_tier, target_effective_from, current_rate_version, true, true
  )
  on conflict (teacher_id, effective_from) do update set
    payment_tier = excluded.payment_tier,
    rate_version_id = excluded.rate_version_id,
    effective_to = null,
    pay_stub_eligible = true,
    payroll_eligible = true,
    updated_at = now()
  returning * into result;
  insert into public.payroll_audit_log (action, entity_type, entity_id, after_data)
  values ('payment_tier_assigned', 'teacher', target_teacher_id::text, to_jsonb(result));
  return result;
end;
$$;

alter table public.payroll_rate_versions enable row level security;
alter table public.teacher_payment_tier_assignments enable row level security;
alter table public.class_occurrences enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.student_billing_months enable row level security;
alter table public.teacher_work_hours enable row level security;
alter table public.payroll_teacher_summaries enable row level security;
alter table public.payroll_line_items enable row level security;
alter table public.payroll_holds enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_payment_records enable row level security;
alter table public.payroll_pay_stubs enable row level security;
alter table public.payroll_audit_log enable row level security;

create policy "leaders manage payroll rates" on public.payroll_rate_versions for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "leaders manage payment tiers" on public.teacher_payment_tier_assignments for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "leaders manage class occurrences" on public.class_occurrences for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "teachers read assigned class occurrences" on public.class_occurrences for select to authenticated
using (teacher_id = auth.uid());
create policy "leaders manage payroll periods" on public.payroll_periods for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "leaders manage billing months" on public.student_billing_months for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "leaders manage working hours" on public.teacher_work_hours for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "teachers read own working hours" on public.teacher_work_hours for select to authenticated
using (teacher_id = auth.uid());
create policy "leaders manage payroll summaries" on public.payroll_teacher_summaries for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "teachers read own finalized summaries" on public.payroll_teacher_summaries for select to authenticated
using (teacher_id = auth.uid() and status in ('finalized', 'paid'));
create policy "leaders manage payroll lines" on public.payroll_line_items for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "teachers read own finalized lines" on public.payroll_line_items for select to authenticated
using (exists (select 1 from public.payroll_teacher_summaries s where s.id = summary_id and s.teacher_id = auth.uid() and s.status in ('finalized', 'paid')));
create policy "leaders manage payroll holds" on public.payroll_holds for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "leaders manage payroll adjustments" on public.payroll_adjustments for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "leaders manage payment records" on public.payroll_payment_records for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "teachers read own pay stubs" on public.payroll_pay_stubs for select to authenticated
using (teacher_id = auth.uid() and finalized);
create policy "leaders manage pay stubs" on public.payroll_pay_stubs for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy "leaders read payroll audit log" on public.payroll_audit_log for select to authenticated
using (public.is_director_or_admin());
create policy "leaders insert payroll audit log" on public.payroll_audit_log for insert to authenticated
with check (public.is_director_or_admin());

grant select, insert, update, delete on public.payroll_rate_versions to authenticated;
grant select, insert, update, delete on public.teacher_payment_tier_assignments to authenticated;
grant select, insert, update, delete on public.class_occurrences to authenticated;
grant select, insert, update, delete on public.payroll_periods to authenticated;
grant select, insert, update, delete on public.student_billing_months to authenticated;
grant select, insert, update, delete on public.teacher_work_hours to authenticated;
grant select, insert, update, delete on public.payroll_teacher_summaries to authenticated;
grant select, insert, update, delete on public.payroll_line_items to authenticated;
grant select, insert, update, delete on public.payroll_holds to authenticated;
grant select, insert, update, delete on public.payroll_adjustments to authenticated;
grant select, insert, update, delete on public.payroll_payment_records to authenticated;
grant select, insert, update, delete on public.payroll_pay_stubs to authenticated;
grant select, insert on public.payroll_audit_log to authenticated;
grant usage, select on sequence public.payroll_audit_log_id_seq to authenticated;
grant execute on function public.ensure_payroll_periods(date) to authenticated;
grant execute on function public.set_teacher_payment_tier(uuid, text, date) to authenticated;

comment on table public.payroll_rate_versions is 'Effective-dated payroll formulas. Historical payroll snapshots never depend on mutable current rates.';
comment on table public.class_occurrences is 'Auditable scheduled, canceled, rescheduled, makeup, and ISD-closure class dates used by payroll.';
comment on table public.student_billing_months is 'Director-entered monthly Brightwheel payment review. Defaults paid; outstanding accounts create payroll holds.';
comment on table public.payroll_teacher_summaries is 'One immutable-on-approval teacher calculation per payroll period.';
