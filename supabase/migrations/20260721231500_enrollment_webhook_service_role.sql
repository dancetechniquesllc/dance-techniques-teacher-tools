-- The Edge Function uses Supabase's server-only service role. Grant only the
-- enrollment intake permissions required to receive and deduplicate webhooks.
grant select, insert, update on public.enrollments to service_role;
