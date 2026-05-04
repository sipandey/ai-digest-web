-- =============================================================================
-- Migration: add user_delivered_papers
--
-- Tracks which arXiv papers have already been delivered to each user so that
-- the same paper is never included in a future digest (unless it is a brand-
-- new submission that happens to share content with an older one — which
-- cannot happen because arXiv IDs are globally unique).
--
-- Unique key: (user_id, arxiv_id)
--   • user_id    — FK to users.id
--   • arxiv_id   — the base arXiv ID stripped of version suffix (e.g. 2401.00001)
--
-- The pipeline upserts a row here immediately after a successful Notion
-- delivery so that, on subsequent days, those papers are excluded from
-- candidates before any LLM scoring takes place.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_delivered_papers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  arxiv_id        text        NOT NULL,
  delivered_date  date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_delivered_papers_user_paper_key UNIQUE (user_id, arxiv_id)
);

COMMENT ON TABLE user_delivered_papers IS
  'Permanent record of every arXiv paper delivered to each user. '
  'The pipeline filters this set out before scoring so users never see '
  'the same paper twice across digest days.';

CREATE INDEX IF NOT EXISTS user_delivered_papers_user_id_idx
  ON user_delivered_papers (user_id);

CREATE INDEX IF NOT EXISTS user_delivered_papers_arxiv_id_idx
  ON user_delivered_papers (arxiv_id);

-- RLS: pipeline uses the service-role key (bypasses RLS).
-- Users can inspect their own history via the anon/authenticated key.
ALTER TABLE user_delivered_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_delivered_papers_select_own ON user_delivered_papers
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );
