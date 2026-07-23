-- Directors retain access to inactive student records so archived dancers can
-- be reviewed without remaining on an active teacher roster.
create policy "leaders see all dancers"
on public.students for select to authenticated
using (public.is_director_or_admin());

create policy "leaders update all dancers"
on public.students for update to authenticated
using (public.is_director_or_admin())
with check (public.is_director_or_admin());

create policy "leaders see all class enrollments"
on public.class_enrollments for select to authenticated
using (public.is_director_or_admin());
