create or replace function public.normalized_tuition_discount(code text, details text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%additional dancer%'
      or lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%sibling%'
      then 'sibling'
    when lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%employee at my dancer%'
      or lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%daycare employee%'
      or lower(coalesce(code, '') || ' ' || coalesce(details, '')) like '%staff%'
      then 'staff'
    else 'none'
  end
$$;

update public.enrollments
set tuition_discount = public.normalized_tuition_discount(discount_code, discount_details),
    updated_at = now()
where coalesce(tuition_discount, 'none') = 'none';

update public.students as student
set tuition_discount = enrollment.tuition_discount,
    updated_at = now()
from public.enrollments as enrollment
where enrollment.placed_student_id = student.id
  and enrollment.tuition_discount in ('sibling', 'staff')
  and student.tuition_discount = 'none';

comment on function public.normalized_tuition_discount(text, text) is
  'Translates the exact Special Circumstances choices from the enrollment Jotform into none, sibling, or staff. Director remains a manual dashboard selection.';
