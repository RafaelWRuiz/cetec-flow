-- NULL distinguishes historical exports without second-option columns from known zeroes.
alter table public.cetec_enrollment_snapshots
  add column if not exists second_option_paid integer check (second_option_paid >= 0),
  add column if not exists second_option_unpaid integer check (second_option_unpaid >= 0);

comment on column public.cetec_enrollment_snapshots.second_option_paid is
  'Paid second-choice registrations. NULL when the source export has no second-choice data.';
comment on column public.cetec_enrollment_snapshots.second_option_unpaid is
  'Unpaid second-choice registrations. NULL when the source export has no second-choice data.';
