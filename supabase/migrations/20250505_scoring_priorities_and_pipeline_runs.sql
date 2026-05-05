-- =============================================================================
-- Migration: fix scoring_priorities key and add pipeline_runs unique constraint
-- =============================================================================

-- 1. Fix the column DEFAULT: "novelty" was the wrong key; the pipeline uses
--    "novelty_timing" as the SCORING_CRITERIA key.  Rows created after this
--    migration get the corrected default.
ALTER TABLE user_configs
  ALTER COLUMN scoring_priorities SET DEFAULT '{
    "builder_relevance": true,
    "understandability": true,
    "real_world_grounding": true,
    "novelty_timing": true
  }';

-- 2. Migrate existing rows: replace "novelty" key with "novelty_timing".
--    Only touches rows that have the old key and don't already have the new one.
UPDATE user_configs
SET scoring_priorities =
  (scoring_priorities - 'novelty') || '{"novelty_timing": true}'::jsonb
WHERE scoring_priorities ? 'novelty'
  AND NOT (scoring_priorities ? 'novelty_timing');

-- 3. Add unique constraint on pipeline_runs(user_id, run_date) to prevent
--    duplicate rows from concurrent trigger requests or race conditions.
--    IF NOT EXISTS is safe for re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_runs_user_date_key
  ON pipeline_runs (user_id, run_date);
