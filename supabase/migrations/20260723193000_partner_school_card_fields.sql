alter table public.partner_schools
  add column if not exists initials text,
  add column if not exists important_notes text;

comment on column public.partner_schools.initials is
  'Director-selected initials shown on the Partner School directory card.';

comment on column public.partner_schools.important_notes is
  'Director-entered operational notes shown in Partner School profiles and My Day.';
