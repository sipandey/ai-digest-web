-- Migration: guest_sessions table for server-side session revocation
--
-- Problem: __digest_sid cookies are HMAC-signed JWTs with a 90-day expiry.
-- If stolen, there is no per-session revocation — the only option was rotating
-- GUEST_SESSION_SECRET, which logs out ALL guest users simultaneously.
--
-- Fix: store one row per session keyed on jti (a UUID embedded in the token
-- payload). verifySessionToken now checks this table for revocation. Logout
-- sets revoked_at instead of only clearing the cookie. Expiry is reduced to
-- 30 days as an additional independent control.
--
-- Existing sessions (pre-migration tokens without a jti claim) are accepted
-- until they expire — the app skips the DB check when jti is absent.

CREATE TABLE IF NOT EXISTS guest_sessions (
  -- jti matches the UUID embedded in the token payload — primary lookup key.
  jti         UUID        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  -- NULL = active.  Set to now() on logout or explicit revocation.
  revoked_at  TIMESTAMPTZ
);

-- Used by auth.ts to look up a session by jti.
-- Partial index only covers active (non-revoked) sessions for efficiency.
CREATE INDEX IF NOT EXISTS guest_sessions_jti_active_idx
  ON guest_sessions (jti)
  WHERE revoked_at IS NULL;

-- Used if we ever want to list or clean up sessions per user.
CREATE INDEX IF NOT EXISTS guest_sessions_user_id_idx
  ON guest_sessions (user_id);

-- Accessed only via service role key — no user-facing RLS policy needed.
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
