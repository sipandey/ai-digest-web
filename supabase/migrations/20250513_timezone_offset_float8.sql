-- Migration: change timezone_offset from NUMERIC(4,2) to FLOAT8
--
-- Problem: PostgreSQL's NUMERIC type is returned as a JSON *string* by
-- the Supabase/PostgREST REST API (e.g. 5.5 → "5.50") to preserve
-- arbitrary-precision decimal values that cannot be represented exactly
-- as IEEE-754 floats. This breaks every consumer that expects a number:
--
--   • jq arithmetic in the GitHub Actions gate job fails with:
--       "number (7) and string ("5.50") cannot be subtracted"
--     causing COUNT="" → users_due="" → the pipeline job condition is
--     false → no scheduled runs ever start.
--
--   • TypeScript UI code that reads timezone_offset as a number receives
--     a string instead, causing wrong dropdown selection and greeting logic.
--
-- Fix: use FLOAT8 (double precision). PostgREST returns FLOAT8 columns as
-- JSON numbers, not strings. Timezone offsets are in the range [-12, 14]
-- with at most 2 decimal places; FLOAT8 represents all of them exactly.
--
-- The USING clause is a no-op numeric cast; no data is lost.

ALTER TABLE user_configs
  ALTER COLUMN timezone_offset TYPE FLOAT8
  USING timezone_offset::FLOAT8;

-- Keep the default at 0 (typed consistently).
ALTER TABLE user_configs
  ALTER COLUMN timezone_offset SET DEFAULT 0;
