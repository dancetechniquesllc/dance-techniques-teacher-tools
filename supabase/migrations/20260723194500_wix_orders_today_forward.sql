-- July 23, 2026 is the Director Dashboard Boutique Backend go-live date.
-- Earlier Wix history stays outside the DD; no historical orders are deleted.
insert into public.wix_sync_state (id, go_live_at)
values ('boutique_orders', timestamptz '2026-07-23 00:00:00-05')
on conflict (id) do update
set
  go_live_at = excluded.go_live_at,
  updated_at = now();
