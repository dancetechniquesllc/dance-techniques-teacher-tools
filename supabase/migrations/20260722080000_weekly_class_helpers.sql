alter table public.dance_classes
  add column if not exists helper_history jsonb not null default '[]'::jsonb;

comment on column public.dance_classes.helper_history is
  'Weekly attendance-aware Helper of the Week assignments for this class.';
