-- Keep the identity sequence ahead of rows that may have been restored manually.
select setval(
  pg_get_serial_sequence('public.cetec_enrollment_snapshots', 'id'),
  greatest(coalesce((select max(id) from public.cetec_enrollment_snapshots), 1), 1),
  true
);
