create table public.cetec_imports (
  id uuid primary key default gen_random_uuid(),
  edition text not null,
  source_file_name text not null,
  source_checksum text not null unique,
  source_path text not null,
  reference_at timestamptz not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  records_count integer not null check (records_count >= 0),
  total_paid integer not null check (total_paid >= 0),
  total_unpaid integer not null check (total_unpaid >= 0),
  total_vacancies integer not null check (total_vacancies >= 0),
  is_active boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

create unique index cetec_imports_one_active_edition
  on public.cetec_imports (edition)
  where is_active;

create index cetec_imports_completed_edition_reference_idx
  on public.cetec_imports (edition, reference_at desc)
  where status = 'completed';

create table public.cetec_enrollment_snapshots (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.cetec_imports (id) on delete cascade,
  local_code text not null,
  etec_code text not null,
  local_type text not null,
  municipality text not null,
  etec_name text not null,
  regional text not null,
  government_region text not null,
  course text not null,
  period text not null,
  vacancies integer not null check (vacancies >= 0),
  paid integer not null check (paid >= 0),
  unpaid integer not null check (unpaid >= 0),
  is_trainee boolean not null default false
);

create index cetec_enrollment_snapshots_import_id_idx
  on public.cetec_enrollment_snapshots (import_id);

alter table public.cetec_imports enable row level security;
alter table public.cetec_enrollment_snapshots enable row level security;

insert into storage.buckets (id, name, public)
values ('cetec-flow-imports', 'cetec-flow-imports', false)
on conflict (id) do update set public = false;
