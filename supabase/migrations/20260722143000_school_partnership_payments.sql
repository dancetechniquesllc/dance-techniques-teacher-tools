create table if not exists public.school_partnership_payments (
  id uuid primary key default gen_random_uuid(),
  partner_school_id uuid not null references public.partner_schools(id) on delete restrict,
  payment_month date not null,
  partnership_benefit text,
  expected_amount numeric(12,2) not null default 0,
  held_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'held', 'ready', 'paid', 'reopened', 'void')),
  paid_date date,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  paid_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_school_id, payment_month)
);

create table if not exists public.school_partnership_payment_lines (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.school_partnership_payments(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  tuition_discount text not null default 'none',
  tuition_amount numeric(12,2) not null default 0,
  partnership_share numeric(12,2) not null default 0,
  held boolean not null default false,
  hold_reason text,
  line_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists school_partnership_payments_month_status_idx
  on public.school_partnership_payments (payment_month desc, status);
create index if not exists school_partnership_payment_lines_payment_idx
  on public.school_partnership_payment_lines (payment_id);

drop trigger if exists school_partnership_payments_set_updated_at on public.school_partnership_payments;
create trigger school_partnership_payments_set_updated_at
before update on public.school_partnership_payments
for each row execute function public.set_updated_at();

alter table public.school_partnership_payments enable row level security;
alter table public.school_partnership_payment_lines enable row level security;

create policy "leaders manage school partnership payments"
on public.school_partnership_payments for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());

create policy "leaders manage school partnership payment lines"
on public.school_partnership_payment_lines for all to authenticated
using (public.is_director_or_admin()) with check (public.is_director_or_admin());

grant select, insert, update, delete on public.school_partnership_payments to authenticated;
grant select, insert, update, delete on public.school_partnership_payment_lines to authenticated;
