-- Legacy deployments used a composite primary key that cannot represent every offer.
alter table public.cetec_enrollment_snapshots
  drop constraint if exists cetec_enrollment_snapshots_pkey;

alter table public.cetec_enrollment_snapshots
  add column if not exists id bigint generated always as identity;

update public.cetec_enrollment_snapshots
set id = default
where id is null;

alter table public.cetec_enrollment_snapshots
  alter column id set not null,
  add constraint cetec_enrollment_snapshots_pkey primary key (id);
