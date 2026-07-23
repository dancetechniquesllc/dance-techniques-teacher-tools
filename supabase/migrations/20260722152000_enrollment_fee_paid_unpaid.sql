-- Preserve the former detailed value before simplifying the operational status.
-- This keeps historical failed/pending/refunded information available for audit.
update public.enrollments
set additional_information = coalesce(additional_information, '{}'::jsonb)
  || jsonb_build_object('original_enrollment_fee_status', payment_status)
where payment_status is not null
  and payment_status not in ('paid', 'unpaid')
  and not coalesce(additional_information, '{}'::jsonb) ? 'original_enrollment_fee_status';

alter table public.enrollments
  drop constraint if exists enrollments_payment_status_check;

update public.enrollments
set payment_status = case when payment_status = 'paid' then 'paid' else 'unpaid' end,
    updated_at = now();

alter table public.enrollments
  alter column payment_status set default 'unpaid';

alter table public.enrollments
  add constraint enrollments_payment_status_check
  check (payment_status in ('paid', 'unpaid'));

comment on column public.enrollments.payment_status is
  'Enrollment fee status read from the Square payment result in the Jotform submission. Operational values are paid or unpaid only.';
