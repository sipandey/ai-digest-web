-- Store each user's daily paper payload for the in-app digest history.
-- Keep this migration scoped to the missing table; scheduling access is
-- managed by the existing restricted RPC migration.

CREATE TABLE IF NOT EXISTS digests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_date    date        NOT NULL DEFAULT current_date,
  lens        text        NOT NULL DEFAULT 'builder'
                          CHECK (lens IN ('founder', 'builder', 'researcher')),
  papers      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  top_score   float8,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digests_user_date_key UNIQUE (user_id, run_date)
);

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
