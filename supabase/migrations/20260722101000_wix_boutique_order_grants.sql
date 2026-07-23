grant all on table public.boutique_orders to service_role;
grant all on table public.boutique_order_items to service_role;

grant select, update on table public.boutique_orders to authenticated;
grant select on table public.boutique_order_items to authenticated;
