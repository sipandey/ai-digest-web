-- =============================================================================
-- Migration: Add paper feedback and multi-channel delivery settings
-- =============================================================================

-- 1. Extend user_configs with email digest and team webhook fields
ALTER TABLE user_configs
  ADD COLUMN IF NOT EXISTS email_digest_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_email text,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_platform text NOT NULL DEFAULT 'slack'
    CHECK (webhook_platform IN ('slack', 'discord', 'generic'));

-- 2. Create paper_feedback table for personalization
CREATE TABLE IF NOT EXISTS paper_feedback (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  arxiv_id         text        NOT NULL,
  rating           text        NOT NULL CHECK (rating IN ('more', 'less')),
  paper_title      text,
  paper_categories text[],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paper_feedback_user_arxiv_unique UNIQUE (user_id, arxiv_id)
);

CREATE INDEX IF NOT EXISTS paper_feedback_user_id_idx ON paper_feedback (user_id);
CREATE INDEX IF NOT EXISTS paper_feedback_arxiv_id_idx ON paper_feedback (arxiv_id);

CREATE TRIGGER paper_feedback_set_updated_at
  BEFORE UPDATE ON paper_feedback
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. RLS policies for paper_feedback
ALTER TABLE paper_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paper_feedback_service_role_all"
  ON paper_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "paper_feedback_authenticated_select"
  ON paper_feedback
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "paper_feedback_authenticated_insert"
  ON paper_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "paper_feedback_authenticated_update"
  ON paper_feedback
  FOR UPDATE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.uid()::text
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "paper_feedback_authenticated_delete"
  ON paper_feedback
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.uid()::text
    )
  );
