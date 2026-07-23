-- Secure Wix boutique order intake. Wix credentials remain in Edge Function
-- secrets; browser clients only receive rows allowed by these RLS policies.

create table if not exists public.boutique_orders (
  id uuid primary key default gen_random_uuid(),
  wix_order_id text not null unique,
  wix_order_number text,
  status text not null default 'to_fill' check (status in ('to_fill', 'to_pick_up', 'to_deliver', 'delivered', 'cancelled')),
  wix_status text,
  payment_status text,
  fulfillment_status text,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  currency text,
  total numeric(12,2),
  assigned_student_id uuid references public.students(id) on delete set null,
  filled_at timestamptz,
  filled_by uuid references public.profiles(id) on delete set null,
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id) on delete set null,
  wix_created_at timestamptz,
  wix_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  raw_order jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boutique_order_items (
  id uuid primary key default gen_random_uuid(),
  boutique_order_id uuid not null references public.boutique_orders(id) on delete cascade,
  wix_line_item_id text not null,
  product_id text,
  variant_id text,
  name text not null default 'Boutique item',
  description text,
  quantity integer not null default 1 check (quantity > 0),
  price numeric(12,2),
  image_url text,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (boutique_order_id, wix_line_item_id)
);

create index if not exists boutique_orders_status_idx on public.boutique_orders(status, wix_created_at desc);
create index if not exists boutique_orders_student_idx on public.boutique_orders(assigned_student_id) where assigned_student_id is not null;
create index if not exists boutique_order_items_order_idx on public.boutique_order_items(boutique_order_id);

drop trigger if exists boutique_orders_set_updated_at on public.boutique_orders;
create trigger boutique_orders_set_updated_at before update on public.boutique_orders
for each row execute function public.set_updated_at();
drop trigger if exists boutique_order_items_set_updated_at on public.boutique_order_items;
create trigger boutique_order_items_set_updated_at before update on public.boutique_order_items
for each row execute function public.set_updated_at();

alter table public.boutique_orders enable row level security;
alter table public.boutique_order_items enable row level security;

create policy "leaders see all boutique orders and assigned teachers see theirs"
on public.boutique_orders for select to authenticated
using (
  public.is_director_or_admin()
  or (assigned_student_id is not null and public.teacher_has_student(assigned_student_id))
);

create policy "leaders manage boutique orders"
on public.boutique_orders for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create policy "users see permitted boutique order items"
on public.boutique_order_items for select to authenticated
using (exists (
  select 1 from public.boutique_orders orders
  where orders.id = boutique_order_id
    and (public.is_director_or_admin() or (orders.assigned_student_id is not null and public.teacher_has_student(orders.assigned_student_id)))
));

create policy "leaders manage boutique order items"
on public.boutique_order_items for all to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create or replace function public.advance_boutique_order_status(order_id uuid, new_status text)
returns public.boutique_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.boutique_orders;
  saved_order public.boutique_orders;
begin
  select * into current_order from public.boutique_orders where id = order_id for update;
  if current_order.id is null then raise exception 'Boutique order not found'; end if;
  if not public.is_director_or_admin()
     and (current_order.assigned_student_id is null or not public.teacher_has_student(current_order.assigned_student_id)) then
    raise exception 'Boutique order is not assigned to this teacher';
  end if;
  if new_status not in ('to_fill', 'to_pick_up', 'to_deliver', 'delivered') then
    raise exception 'Invalid boutique order status';
  end if;

  update public.boutique_orders
  set status = new_status,
      filled_at = case when new_status in ('to_pick_up', 'to_deliver', 'delivered') then coalesce(filled_at, now()) else null end,
      filled_by = case when new_status in ('to_pick_up', 'to_deliver', 'delivered') then coalesce(filled_by, auth.uid()) else null end,
      picked_up_at = case when new_status in ('to_deliver', 'delivered') then coalesce(picked_up_at, now()) else null end,
      picked_up_by = case when new_status in ('to_deliver', 'delivered') then coalesce(picked_up_by, auth.uid()) else null end,
      delivered_at = case when new_status = 'delivered' then coalesce(delivered_at, now()) else null end,
      delivered_by = case when new_status = 'delivered' then coalesce(delivered_by, auth.uid()) else null end
  where id = order_id
  returning * into saved_order;
  return saved_order;
end;
$$;

revoke all on function public.advance_boutique_order_status(uuid, text) from public;
grant execute on function public.advance_boutique_order_status(uuid, text) to authenticated;
