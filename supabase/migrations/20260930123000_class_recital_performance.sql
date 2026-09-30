alter table public.dance_classes
  add column if not exists recital_performance text;

alter table public.dance_classes
  drop constraint if exists dance_classes_recital_performance_check;

alter table public.dance_classes
  add constraint dance_classes_recital_performance_check
  check (recital_performance is null or recital_performance in ('tap', 'ballet', 'either'));

comment on column public.dance_classes.recital_performance is
  'Director-selected recital performance. Null uses the calculated recommendation.';
