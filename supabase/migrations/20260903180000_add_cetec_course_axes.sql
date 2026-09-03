create table public.cetec_course_axes (
  course_code integer primary key,
  course_name text not null,
  course_key text not null,
  technological_axis text not null,
  professional_area text,
  source_file text not null,
  updated_at timestamptz not null default now()
);

create index cetec_course_axes_course_key_idx
  on public.cetec_course_axes (course_key);

alter table public.cetec_course_axes enable row level security;

revoke all on table public.cetec_course_axes from anon, authenticated;
grant select, insert, update, delete on table public.cetec_course_axes to service_role;
