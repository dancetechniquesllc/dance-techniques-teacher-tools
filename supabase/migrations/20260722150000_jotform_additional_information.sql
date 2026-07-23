alter table public.enrollments
  add column if not exists additional_information jsonb not null default '{}'::jsonb;

alter table public.students
  add column if not exists additional_information jsonb not null default '{}'::jsonb;

update public.students as student
set additional_information = coalesce(enrollment.additional_information, '{}'::jsonb),
    updated_at = now()
from public.enrollments as enrollment
where enrollment.placed_student_id = student.id
  and coalesce(enrollment.additional_information, '{}'::jsonb) <> '{}'::jsonb;

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

  -- A newly linked intake may be an older record with unanswered fields. Only
  -- use populated intake values during the initial link so existing profile
  -- data is never replaced by legacy blanks.
  if tg_op = 'INSERT'
    or new.placed_student_id is distinct from old.placed_student_id then
    update public.students
    set first_name = coalesce(nullif(btrim(new.student_first_name), ''), first_name),
        last_name = coalesce(nullif(btrim(new.student_last_name), ''), last_name),
        preferred_name = coalesce(nullif(btrim(new.student_preferred_name), ''), preferred_name),
        birth_date = coalesce(new.student_birth_date, birth_date),
        gender = case
          when lower(coalesce(new.student_gender, '')) = 'female' then 'female'::public.gender_option
          when lower(coalesce(new.student_gender, '')) = 'male' then 'male'::public.gender_option
          else gender
        end,
        classroom = coalesce(nullif(btrim(new.student_classroom), ''), classroom),
        official_classroom = coalesce(nullif(btrim(new.official_classroom), ''), official_classroom),
        tshirt_size = coalesce(nullif(btrim(new.tshirt_size), ''), tshirt_size),
        parent_name = coalesce(nullif(btrim(coalesce(new.parent_name, concat_ws(' ', new.parent_first_name, new.parent_last_name))), ''), parent_name),
        parent_first_name = coalesce(nullif(btrim(new.parent_first_name), ''), parent_first_name),
        parent_last_name = coalesce(nullif(btrim(new.parent_last_name), ''), parent_last_name),
        parent_phone = coalesce(nullif(btrim(new.parent_phone), ''), parent_phone),
        parent_email = coalesce(nullif(lower(btrim(new.parent_email)), ''), parent_email),
        medical_notes = coalesce(nullif(btrim(new.medical_notes), ''), medical_notes),
        registration_notes = coalesce(nullif(btrim(new.registration_notes), ''), registration_notes),
        additional_information = case
          when coalesce(new.additional_information, '{}'::jsonb) <> '{}'::jsonb then new.additional_information
          else additional_information
        end,
        updated_at = now()
    where id = new.placed_student_id;

    return new;
  end if;

  -- Once linked, synchronize only fields that actually changed in the intake.
  -- This still allows a director to intentionally clear a field, while an edit
  -- elsewhere on the enrollment cannot erase unrelated student information.
  update public.students
  set first_name = case when new.student_first_name is distinct from old.student_first_name then nullif(btrim(new.student_first_name), '') else first_name end,
      last_name = case when new.student_last_name is distinct from old.student_last_name then nullif(btrim(new.student_last_name), '') else last_name end,
      preferred_name = case when new.student_preferred_name is distinct from old.student_preferred_name then nullif(btrim(new.student_preferred_name), '') else preferred_name end,
      birth_date = case when new.student_birth_date is distinct from old.student_birth_date then new.student_birth_date else birth_date end,
      gender = case
        when new.student_gender is not distinct from old.student_gender then gender
        when lower(coalesce(new.student_gender, '')) = 'female' then 'female'::public.gender_option
        when lower(coalesce(new.student_gender, '')) = 'male' then 'male'::public.gender_option
        else gender
      end,
      classroom = case when new.student_classroom is distinct from old.student_classroom then nullif(btrim(new.student_classroom), '') else classroom end,
      official_classroom = case when new.official_classroom is distinct from old.official_classroom then nullif(btrim(new.official_classroom), '') else official_classroom end,
      tshirt_size = case when new.tshirt_size is distinct from old.tshirt_size then nullif(btrim(new.tshirt_size), '') else tshirt_size end,
      parent_name = case when new.parent_name is distinct from old.parent_name or new.parent_first_name is distinct from old.parent_first_name or new.parent_last_name is distinct from old.parent_last_name then nullif(btrim(coalesce(new.parent_name, concat_ws(' ', new.parent_first_name, new.parent_last_name))), '') else parent_name end,
      parent_first_name = case when new.parent_first_name is distinct from old.parent_first_name then nullif(btrim(new.parent_first_name), '') else parent_first_name end,
      parent_last_name = case when new.parent_last_name is distinct from old.parent_last_name then nullif(btrim(new.parent_last_name), '') else parent_last_name end,
      parent_phone = case when new.parent_phone is distinct from old.parent_phone then nullif(btrim(new.parent_phone), '') else parent_phone end,
      parent_email = case when new.parent_email is distinct from old.parent_email then nullif(lower(btrim(new.parent_email)), '') else parent_email end,
      medical_notes = case when new.medical_notes is distinct from old.medical_notes then nullif(btrim(new.medical_notes), '') else medical_notes end,
      registration_notes = case when new.registration_notes is distinct from old.registration_notes then nullif(btrim(new.registration_notes), '') else registration_notes end,
      additional_information = case when new.additional_information is distinct from old.additional_information then coalesce(new.additional_information, '{}'::jsonb) else additional_information end,
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
  medical_notes, registration_notes, additional_information, placed_student_id
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
      additional_information = coalesce(new.additional_information, '{}'::jsonb),
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
  parent_last_name, parent_phone, parent_email, medical_notes, registration_notes,
  additional_information
on public.students
for each row execute function public.sync_enrollment_intake_from_student();

comment on column public.enrollments.additional_information is
  'Editable answers from Jotform questions that do not have a dedicated enrollment column.';

comment on column public.students.additional_information is
  'Editable additional registration answers synchronized from the linked enrollment intake.';
