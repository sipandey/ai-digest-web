-- =============================================================================
-- Migration: add digest_lens to user_configs
--
-- Democratizes the bifurcated "owner mode" into a configurable lens available
-- to all users:
--   - 'builder'    (default) — Focus on practical implementation, technical architecture, engineering takeaways
--   - 'founder'    — Opportunity-scouting lens (consumer/SMB pain, GTM moats, automation potential)
--   - 'researcher' — Deep-tech lens (theoretical novelty, methodology, benchmark performance)
-- =============================================================================

ALTER TABLE user_configs
  ADD COLUMN IF NOT EXISTS digest_lens text NOT NULL DEFAULT 'builder'
  CHECK (digest_lens IN ('founder', 'builder', 'researcher'));

COMMENT ON COLUMN user_configs.digest_lens IS
  'Active scoring and summary lens: builder (engineering takeaways), founder (opportunity scouting), researcher (deep tech).';
