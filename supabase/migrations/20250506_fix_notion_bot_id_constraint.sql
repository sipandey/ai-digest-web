-- =============================================================================
-- Migration: fix notion_bot_id unique constraint for guest upsert
--
-- Problem: the previous migration created a *partial* unique index
--   (WHERE notion_bot_id IS NOT NULL).  PostgreSQL's ON CONFLICT (column)
--   clause only resolves against a full unique CONSTRAINT, not a partial index.
--   This caused every guest /api/guest/setup call to fail with a 500.
--
-- Fix: drop the partial index and replace it with a proper unique constraint.
--   NULLs are always distinct in PostgreSQL unique constraints, so multiple
--   rows with notion_bot_id = NULL are still permitted.
--
-- Also: add the `active` column to users if it is missing (it was present in
--   the schema.sql CREATE TABLE but may be absent in older deployments).
-- =============================================================================

-- 1. Drop the partial unique index from the previous migration
DROP INDEX IF EXISTS users_notion_bot_id_key;

-- 2. Add a proper unique constraint (allows multiple NULLs; blocks duplicate non-null values)
--    Wrapped in DO block because ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_notion_bot_id_key'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_notion_bot_id_key UNIQUE (notion_bot_id);
  END IF;
END$$;

-- 3. Ensure the `active` column exists (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
