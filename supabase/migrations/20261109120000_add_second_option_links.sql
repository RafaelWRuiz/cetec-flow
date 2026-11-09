create table if not exists public.cetec_second_option_imports (
  id uuid primary key default gen_random_uuid(),
  edition text not null,
  source_file_name text not null,
  source_checksum text not null unique,
  reference_at timestamptz,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  source_rows integer not null check (source_rows >= 0),
  linked_pairs integer not null check (linked_pairs >= 0),
  created_at timestamptz not null default now()
);

create index if not exists cetec_second_option_imports_edition_reference_idx
  on public.cetec_second_option_imports (edition, reference_at desc);

create table if not exists public.cetec_second_option_links (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.cetec_second_option_imports (id) on delete cascade,
  source_turma_id text not null,
  destination_turma_id text not null,
  applicant_count integer not null check (applicant_count >= 0),
  created_at timestamptz not null default now(),
  unique (import_id, source_turma_id, destination_turma_id),
  check (source_turma_id <> destination_turma_id)
);

create index if not exists cetec_second_option_links_import_idx
  on public.cetec_second_option_links (import_id);

create index if not exists cetec_second_option_links_destination_idx
  on public.cetec_second_option_links (import_id, destination_turma_id);

alter table public.cetec_second_option_imports enable row level security;
alter table public.cetec_second_option_links enable row level security;
