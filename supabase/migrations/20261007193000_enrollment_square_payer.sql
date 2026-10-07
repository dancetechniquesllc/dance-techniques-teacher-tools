alter table public.enrollments
  add column if not exists payment_payer_name text;

update public.enrollments
set payment_payer_name = coalesce(nullif(btrim(parent_name), ''), nullif(btrim(concat_ws(' ', parent_first_name, parent_last_name)), ''))
where payment_status = 'paid'
  and nullif(btrim(payment_payer_name), '') is null;

comment on column public.enrollments.payment_payer_name is
  'Name associated with the Square enrollment-fee payment, with the submitted parent name retained as a legacy fallback.';
