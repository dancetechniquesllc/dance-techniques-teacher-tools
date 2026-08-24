-- One operational email per Central-time day when family payments succeed.

create table if not exists public.daily_payment_summary_deliveries (
  summary_date date primary key,
  payment_count integer not null check (payment_count > 0),
  total_cents integer not null check (total_cents > 0),
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  sent_at timestamptz,
  safe_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_payment_summary_deliveries enable row level security;
revoke all on public.daily_payment_summary_deliveries from anon, authenticated;
grant select, insert, update on public.daily_payment_summary_deliveries to service_role;

comment on table public.daily_payment_summary_deliveries is
  'Idempotency and audit record for one successful-payment summary email per America/Chicago calendar day.';

-- Repair the published issuer's ambiguous cycle identifier so the scheduled
-- invoice run can prepare the first-of-month attempt reliably.
create or replace function public.issue_upcoming_monthly_family_invoices(processing_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account record;
  target_month date := (processing_date + interval '3 days')::date;
  prepared_cycle_id uuid;
  issued_count integer := 0;
begin
  if extract(day from target_month)::integer <> 1 then return 0; end if;
  target_month := date_trunc('month', target_month)::date;
  for account in
    select billing.id from public.family_billing_accounts billing
    where billing.square_environment = 'sandbox' and billing.automatic_billing_enabled
      and exists (select 1 from public.student_tuition_plans plan where plan.billing_account_id = billing.id and plan.status = 'active'
        and plan.starts_on <= (target_month + interval '1 month - 1 day')::date and plan.ends_on >= target_month)
      and not exists (select 1 from public.family_billing_cycles cycle where cycle.billing_account_id = billing.id and cycle.cycle_month = target_month and cycle.cycle_type = 'monthly')
  loop
    prepared_cycle_id := public.prepare_family_billing_cycle(account.id, target_month, 'monthly', null);
    update public.family_billing_cycles set status = 'approved', approved_at = now(), invoice_issued_at = now(), due_on = target_month, invoice_email_status = 'pending' where id = prepared_cycle_id;
    insert into public.family_billing_attempts (cycle_id, attempt_stage, scheduled_for, amount_cents, idempotency_key)
    select cycle.id, 'first', target_month, cycle.total_cents, 'dt_' || replace(cycle.id::text, '-', '') || '_1'
    from public.family_billing_cycles cycle where cycle.id = prepared_cycle_id and cycle.total_cents > 0
    on conflict (cycle_id, attempt_stage) do nothing;
    issued_count := issued_count + 1;
  end loop;
  return issued_count;
end;
$$;
