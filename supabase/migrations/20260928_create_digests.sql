-- =============================================================================
-- Migration: 20260928_create_digests.sql
-- Create digests table for storing in-app web digests per user per run date.
-- =============================================================================

CREATE TABLE IF NOT EXISTS digests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_date    date        NOT NULL DEFAULT current_date,
  lens        text        NOT NULL DEFAULT 'builder' CHECK (lens IN ('founder', 'builder', 'researcher')),
  papers      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  top_score   float8,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT digests_user_date_key UNIQUE (user_id, run_date)
);

COMMENT ON TABLE digests IS
  'Daily summarized papers per user for in-app Web Digest reader viewing, independent of Notion export.';

CREATE INDEX IF NOT EXISTS digests_user_date_idx
  ON digests (user_id, run_date DESC);

ALTER TABLE digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS digests_select_own ON digests;
CREATE POLICY digests_select_own ON digests
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- Update anon scheduling read to not require notion_connected
DROP POLICY IF EXISTS user_configs_anon_scheduling_read ON user_configs;
CREATE POLICY user_configs_anon_scheduling_read
  ON user_configs
  FOR SELECT
  TO anon
  USING (active = true);
