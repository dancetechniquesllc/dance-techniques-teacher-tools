alter table public.partner_schools
  add column if not exists partnership_benefit text;

comment on column public.partner_schools.partnership_benefit is
  'The tuition or apparel benefit associated with the school partnership.';
