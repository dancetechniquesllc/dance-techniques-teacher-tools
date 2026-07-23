alter table public.students
  add column if not exists preferred_name text,
  add column if not exists classroom text,
  add column if not exists tshirt_size text,
  add column if not exists parent_first_name text,
  add column if not exists parent_last_name text,
  add column if not exists medical_notes text,
  add column if not exists registration_notes text,
  add column if not exists kit_received boolean not null default false;

update public.students as student
set preferred_name = coalesce(nullif(btrim(enrollment.student_preferred_name), ''), student.preferred_name),
    classroom = coalesce(nullif(btrim(enrollment.student_classroom), ''), student.classroom),
    official_classroom = coalesce(nullif(btrim(enrollment.official_classroom), ''), student.official_classroom),
    tshirt_size = coalesce(nullif(btrim(enrollment.tshirt_size), ''), student.tshirt_size),
    parent_name = coalesce(nullif(btrim(enrollment.parent_name), ''), student.parent_name),
    parent_first_name = coalesce(nullif(btrim(enrollment.parent_first_name), ''), student.parent_first_name),
    parent_last_name = coalesce(nullif(btrim(enrollment.parent_last_name), ''), student.parent_last_name),
    parent_phone = coalesce(nullif(btrim(enrollment.parent_phone), ''), student.parent_phone),
    parent_email = coalesce(nullif(lower(btrim(enrollment.parent_email)), ''), student.parent_email),
    medical_notes = coalesce(nullif(btrim(enrollment.medical_notes), ''), student.medical_notes),
    registration_notes = coalesce(nullif(btrim(enrollment.registration_notes), ''), student.registration_notes),
    updated_at = now()
from public.enrollments as enrollment
where enrollment.placed_student_id = student.id;

create or replace function public.sync_student_from_enrollment_intake()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.placed_student_id is null then
    return new;
  end if;

  update public.students
  set first_name = coalesce(nullif(btrim(new.student_first_name), ''), first_name),
      last_name = coalesce(nullif(btrim(new.student_last_name), ''), last_name),
      preferred_name = nullif(btrim(new.student_preferred_name), ''),
      birth_date = coalesce(new.student_birth_date, birth_date),
      gender = case
        when lower(coalesce(new.student_gender, '')) = 'female' then 'female'::public.gender_option
        when lower(coalesce(new.student_gender, '')) = 'male' then 'male'::public.gender_option
        else gender
      end,
      classroom = nullif(btrim(new.student_classroom), ''),
      official_classroom = nullif(btrim(new.official_classroom), ''),
      tshirt_size = nullif(btrim(new.tshirt_size), ''),
      parent_name = nullif(btrim(coalesce(new.parent_name, concat_ws(' ', new.parent_first_name, new.parent_last_name))), ''),
      parent_first_name = nullif(btrim(new.parent_first_name), ''),
      parent_last_name = nullif(btrim(new.parent_last_name), ''),
      parent_phone = nullif(btrim(new.parent_phone), ''),
      parent_email = nullif(lower(btrim(new.parent_email)), ''),
      medical_notes = nullif(btrim(new.medical_notes), ''),
      registration_notes = nullif(btrim(new.registration_notes), ''),
      updated_at = now()
  where id = new.placed_student_id;

  return new;
end;
$$;

drop trigger if exists enrollment_intake_syncs_student on public.enrollments;
create trigger enrollment_intake_syncs_student
after insert or update of
  student_first_name, student_last_name, student_preferred_name, student_birth_date,
  student_gender, student_classroom, official_classroom, tshirt_size,
  parent_name, parent_first_name, parent_last_name, parent_phone, parent_email,
  medical_notes, registration_notes, placed_student_id
on public.enrollments
for each row execute function public.sync_student_from_enrollment_intake();

create or replace function public.sync_enrollment_intake_from_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.enrollments
  set student_first_name = new.first_name,
      student_last_name = new.last_name,
      student_preferred_name = new.preferred_name,
      student_birth_date = new.birth_date,
      student_gender = new.gender::text,
      student_classroom = new.classroom,
      official_classroom = new.official_classroom,
      tshirt_size = new.tshirt_size,
      parent_name = new.parent_name,
      parent_first_name = new.parent_first_name,
      parent_last_name = new.parent_last_name,
      parent_phone = new.parent_phone,
      parent_email = new.parent_email,
      medical_notes = new.medical_notes,
      registration_notes = new.registration_notes,
      updated_at = now()
  where placed_student_id = new.id;

  return new;
end;
$$;

drop trigger if exists student_syncs_enrollment_intake on public.students;
create trigger student_syncs_enrollment_intake
after update of
  first_name, last_name, preferred_name, birth_date, gender, classroom,
  official_classroom, tshirt_size, parent_name, parent_first_name,
  parent_last_name, parent_phone, parent_email, medical_notes, registration_notes
on public.students
for each row execute function public.sync_enrollment_intake_from_student();
