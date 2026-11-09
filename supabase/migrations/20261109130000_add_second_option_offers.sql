alter table public.cetec_second_option_imports
  add column if not exists offers jsonb not null default '[]'::jsonb;
