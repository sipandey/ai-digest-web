-- =============================================================================
-- Migration: add trigger_count to pipeline_runs
--
-- Tracks how many times a user has manually triggered the pipeline for a
-- given run_date.  Used server-side to enforce a daily manual-run cap without
-- relying on in-memory state (which doesn't work across Vercel instances).
-- =============================================================================

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS trigger_count integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN pipeline_runs.trigger_count IS
  'Number of times this run row has been triggered (initial + reruns). '
  'Capped server-side to prevent runaway OpenAI spend.';
