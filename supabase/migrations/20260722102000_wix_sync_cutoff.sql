-- Preserve the director-approved three-order sample while preventing older Wix
-- history from being imported. Orders created after this cutoff are live orders.
create table if not exists public.wix_sync_state (
  id text primary key,
  go_live_at timestamptz not null,
  updated_at timestamptz not null default now()
);

insert into public.wix_sync_state (id, go_live_at)
values ('boutique_orders', now())
on conflict (id) do nothing;

alter table public.wix_sync_state enable row level security;
revoke all on public.wix_sync_state from anon, authenticated;
grant all on public.wix_sync_state to service_role;
