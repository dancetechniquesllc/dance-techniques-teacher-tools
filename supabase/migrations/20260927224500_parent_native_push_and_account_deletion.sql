create table if not exists public.parent_native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists parent_native_push_tokens_user_idx
  on public.parent_native_push_tokens (user_id)
  where active;

alter table public.parent_native_push_tokens enable row level security;

drop policy if exists "parents manage their native push tokens" on public.parent_native_push_tokens;
create policy "parents manage their native push tokens"
on public.parent_native_push_tokens for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update, delete on public.parent_native_push_tokens to authenticated;
grant select, update on public.parent_native_push_tokens to service_role;

create table if not exists public.parent_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  guardian_id uuid references public.guardians(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'retained_records')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  retention_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parent_account_deletion_requests_user_idx
  on public.parent_account_deletion_requests (user_id, requested_at desc);

alter table public.parent_account_deletion_requests enable row level security;

drop policy if exists "parents see their account deletion requests" on public.parent_account_deletion_requests;
create policy "parents see their account deletion requests"
on public.parent_account_deletion_requests for select to authenticated
using (user_id = auth.uid());

grant select on public.parent_account_deletion_requests to authenticated;
grant select, insert, update on public.parent_account_deletion_requests to service_role;

comment on table public.parent_native_push_tokens is
  'APNs and FCM device tokens registered by the native Parent Portal.';

comment on table public.parent_account_deletion_requests is
  'Audit trail for Parent Portal account-deletion requests after sign-in access is revoked.';
