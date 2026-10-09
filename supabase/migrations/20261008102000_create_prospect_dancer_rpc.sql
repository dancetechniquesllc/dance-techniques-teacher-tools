alter table public.students
  alter column birth_date drop not null;

create or replace function public.create_prospect_dancer(
  target_class_id uuid,
  dancer jsonb,
  target_trial_date date default null
)
returns table(student_id uuid, enrollment_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_student_id uuid;
  created_enrollment_id uuid;
  dancer_gender public.gender_option;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active staff account is required';
  end if;
  if not public.teacher_has_class(target_class_id) then
    raise exception 'You are not assigned to this class';
  end if;
  if nullif(btrim(dancer->>'first_name'), '') is null
     or nullif(btrim(dancer->>'last_name'), '') is null then
    raise exception 'The dancer first and last name are required';
  end if;

  dancer_gender := case lower(coalesce(dancer->>'gender', ''))
    when 'male' then 'male'::public.gender_option
    when 'female' then 'female'::public.gender_option
    else 'not_specified'::public.gender_option
  end;

  insert into public.students (
    first_name, last_name, preferred_name, birth_date, gender,
    classroom, official_classroom, tshirt_size, tuition_discount,
    parent_name, parent_first_name, parent_last_name, parent_phone,
    parent_email, medical_notes, registration_notes,
    additional_information, created_by
  ) values (
    btrim(dancer->>'first_name'), btrim(dancer->>'last_name'), nullif(btrim(dancer->>'preferred_name'), ''),
    nullif(dancer->>'birth_date', '')::date, dancer_gender,
    nullif(btrim(dancer->>'classroom'), ''), nullif(btrim(dancer->>'official_classroom'), ''),
    nullif(btrim(dancer->>'tshirt_size'), ''), coalesce(nullif(dancer->>'tuition_discount', ''), 'none'),
    nullif(btrim(dancer->>'parent_name'), ''), nullif(btrim(dancer->>'parent_first_name'), ''),
    nullif(btrim(dancer->>'parent_last_name'), ''), nullif(btrim(dancer->>'parent_phone'), ''),
    nullif(btrim(dancer->>'parent_email'), ''), nullif(btrim(dancer->>'medical_notes'), ''),
    nullif(btrim(dancer->>'registration_notes'), ''),
    coalesce(dancer->'additional_information', '{}'::jsonb), auth.uid()
  ) returning id into created_student_id;

  insert into public.class_enrollments (
    dance_class_id, student_id, status, trial_date, created_by
  ) values (
    target_class_id, created_student_id, 'trial', target_trial_date, auth.uid()
  ) returning id into created_enrollment_id;

  return query select created_student_id, created_enrollment_id;
end;
$$;

revoke all on function public.create_prospect_dancer(uuid, jsonb, date) from public;
grant execute on function public.create_prospect_dancer(uuid, jsonb, date) to authenticated;
