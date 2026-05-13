-- Migration: minimal anon read access for the GitHub Actions scheduling check
--
-- Problem: the 'check' job in daily_pipeline.yml used SUPABASE_SERVICE_ROLE_KEY
-- to query digest_hour and timezone_offset. The service role key bypasses RLS
-- and has full DB write access. If a GitHub Actions log ever leaked the key,
-- the blast radius would be the entire database.
--
-- Fix: give the anon role the minimum permission needed for the check query —
-- SELECT on only two columns for rows where active=true AND notion_connected=true.
-- No user IDs, emails, tokens, or any other fields are accessible via anon.
-- The workflow check step now uses SUPABASE_ANON_KEY instead.
--
-- Required GitHub secret: SUPABASE_ANON_KEY
-- (Supabase project dashboard → Settings → API → Project API keys → anon/public)

-- 1. Column-level grant: anon can only read the two scheduling fields.
--    Explicit column list means anon cannot select user_id, notion_token,
--    profile_description, or any other column — PostgREST enforces this.
GRANT SELECT (digest_hour, timezone_offset)
  ON user_configs
  TO anon;

-- 2. RLS policy: anon sees only rows for active, notion-connected users.
--    Combined with the column grant above, this is the minimum surface needed
--    for the jq scheduling gate to count due users.
CREATE POLICY user_configs_anon_scheduling_read
  ON user_configs
  FOR SELECT
  TO anon
  USING (active = true AND notion_connected = true);
