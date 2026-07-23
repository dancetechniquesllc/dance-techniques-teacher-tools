-- Dispatch queued web-push notifications through the secured Edge Function.
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_pending_push_notifications()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
  dispatch_secret text;
begin
  select decrypted_secret
    into dispatch_secret
  from vault.decrypted_secrets
  where name = 'dance_techniques_push_dispatch_secret'
  order by created_at desc
  limit 1;

  if dispatch_secret is null or dispatch_secret = '' then
    raise notice 'Push dispatch secret is not configured in Vault.';
    return;
  end if;

  perform net.http_post(
    url := 'https://pgagpvfiplizahsnmvxf.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.dispatch_pending_push_notifications() from public;
revoke all on function public.dispatch_pending_push_notifications() from anon;
revoke all on function public.dispatch_pending_push_notifications() from authenticated;

create extension if not exists pg_cron with schema extensions;
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'dispatch-pending-push-notifications';

  perform cron.schedule(
    'dispatch-pending-push-notifications',
    '* * * * *',
    'select public.dispatch_pending_push_notifications();'
  );
exception when undefined_table or invalid_schema_name then
  raise notice 'pg_cron is unavailable; schedule dispatch_pending_push_notifications every minute in Supabase Cron.';
end;
$$;
