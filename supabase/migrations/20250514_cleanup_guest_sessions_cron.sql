-- Scheduled cleanup of expired and revoked guest_sessions rows.
--
-- pg_cron is pre-installed on Supabase Pro; it must be enabled once via the
-- Supabase dashboard before this migration runs:
--   Database → Extensions → pg_cron → Enable
--
-- The job runs at 03:00 UTC every Sunday and removes rows whose expires_at
-- is more than 7 days in the past.  The 7-day grace period means any row
-- that was active within the last week is preserved, giving a small window
-- for debugging unexpected logouts before evidence is gone.
--
-- The partial index on guest_sessions (WHERE revoked_at IS NULL) is
-- unaffected — it covers only active sessions, so deleting old rows shrinks
-- the heap without touching the index hot path.
--
-- To verify after applying:
--   SELECT jobname, schedule, command, active FROM cron.job WHERE jobname = 'cleanup-expired-guest-sessions';

SELECT cron.schedule(
  'cleanup-expired-guest-sessions',
  '0 3 * * 0',
  $$DELETE FROM guest_sessions WHERE expires_at < now() - interval '7 days'$$
);
