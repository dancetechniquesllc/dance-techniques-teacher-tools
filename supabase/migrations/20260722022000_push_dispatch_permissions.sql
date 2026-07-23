-- The push dispatcher uses the server-only service role to read the queue,
-- preferences, and devices, then mark completed deliveries.
grant select, update on public.teacher_notifications to service_role;
grant select on public.notification_preferences to service_role;
grant select, update on public.push_subscriptions to service_role;
