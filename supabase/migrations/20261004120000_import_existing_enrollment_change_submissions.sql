insert into public.enrollment_change_requests (
  jotform_submission_id,
  jotform_form_id,
  dancer_first_name,
  dancer_last_name,
  current_school,
  last_day,
  request_type,
  notes,
  policy_acknowledged,
  submitted_at,
  raw_submission
)
values
  ('6669378228117648256','253005393017146','Aarna','Reddy Veermalla','Children''s Lighthouse Sachse','2026-09-01','unenrolling from dance.',null,true,'2026-10-04 11:43:42-05','{"source":"jotform_existing_submission_import"}'::jsonb),
  ('6669377288113854328','253005393017146','Anora','de la Cruz Willard','Kiddie Academy Murphy','2026-09-01','unenrolling from dance.',null,true,'2026-10-04 11:42:08-05','{"source":"jotform_existing_submission_import"}'::jsonb),
  ('6669376248118919476','253005393017146','June','Orozco','Kiddie Academy Murphy','2026-09-01','unenrolling from dance.',null,true,'2026-10-04 11:40:24-05','{"source":"jotform_existing_submission_import"}'::jsonb),
  ('6669374388114151871','253005393017146','Aria','Guevara','Kiddie Academy Murphy','2026-09-30','unenrolling from dance.',null,true,'2026-10-04 11:37:18-05','{"source":"jotform_existing_submission_import"}'::jsonb),
  ('6665998897401017342','253005393017146','Zaylee','Gil','Little Einsteins - Rowlett','2026-09-29','leaving our current school.','Filled out By Tiffany',true,'2026-09-30 13:51:30-05','{"source":"jotform_existing_submission_import"}'::jsonb),
  ('6664290907729479781','253005393017146','Andrea','Moro','Primrose Forney Gateway','2026-10-16','leaving our current school.',null,true,'2026-09-28 14:24:51-05','{"source":"jotform_existing_submission_import"}'::jsonb),
  ('6664254409576054481','253005393017146','Marlee','Wampler','Fulton','2026-09-28','unenrolling from dance.',null,true,'2026-09-28 13:24:00-05','{"source":"jotform_existing_submission_import"}'::jsonb),
  ('6661690900317501432','253005393017146','Isabella','Olvera','Children''s Lighthouse Fate','2026-10-05','unenrolling from dance.','Thank you so much! Bella will miss her Ms Tiffany so much and her dance mondays!',true,'2026-09-25 14:11:30-05','{"source":"jotform_existing_submission_import"}'::jsonb)
on conflict (jotform_submission_id) do update set
  dancer_first_name = excluded.dancer_first_name,
  dancer_last_name = excluded.dancer_last_name,
  current_school = excluded.current_school,
  last_day = excluded.last_day,
  request_type = excluded.request_type,
  notes = excluded.notes,
  policy_acknowledged = excluded.policy_acknowledged,
  submitted_at = excluded.submitted_at;
