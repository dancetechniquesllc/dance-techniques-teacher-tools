-- Recover 2025 recital answers that are present in the original Jotform
-- payload but were not copied into the dedicated enrollment field.
update public.enrollments
set requested_dance_style = nullif(trim(raw_submission->'rawRequest'->>'q78_inLast'), '')
where coalesce(trim(requested_dance_style), '') = ''
  and trim(raw_submission->'rawRequest'->>'q78_inLast') in (
    'Ballet',
    'Tap',
    'I can''t remember'
  );
