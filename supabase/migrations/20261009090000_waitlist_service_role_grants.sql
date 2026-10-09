-- The Jotform webhook runs with the service-role API key. The waitlist audit
-- table was created after the project's default grants and therefore needs an
-- explicit grant for webhook reads and writes.
grant select, insert, update on public.waitlist_submissions to service_role;
grant select on public.partner_schools, public.teacher_school_assignments, public.dance_classes to service_role;
grant select, insert, delete on public.students to service_role;
grant select, insert, delete on public.class_enrollments to service_role;
