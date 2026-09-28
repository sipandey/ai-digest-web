-- =============================================================================
-- ai-digest-web schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at trigger function (shared by users + user_configs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- TABLE: users
-- One row per registered user, synced from Clerk via webhook.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id       text        UNIQUE,          -- NULL for Notion-first (no-account) users
  email          text        UNIQUE,          -- NULL for Notion-first users who skip email
  notion_bot_id  text        UNIQUE,          -- Notion integration bot ID; identity for guest users
  name           text,
  tier           text        NOT NULL DEFAULT 'free'
                             CHECK (tier IN ('free', 'pro')),
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS
  'One row per registered user. Created/updated via Clerk webhook. '
  'tier controls feature access; active=false soft-deletes the account.';

CREATE INDEX IF NOT EXISTS users_clerk_id_idx ON users (clerk_id);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: user_configs
-- Notion credentials, topic preferences, and digest settings per user.
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_configs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  notion_token        text,
  notion_database_id  text,
  notion_connected    boolean     NOT NULL DEFAULT false,
  topics              text[],
  profile_description text,
  experience_level    text        NOT NULL DEFAULT 'developer_learning_ai'
                                  CHECK (experience_level IN (
                                    'beginner',
                                    'developer_learning_ai',
                                    'practitioner',
                                    'ml_engineer'
                                  )),
  scoring_priorities  jsonb       NOT NULL DEFAULT '{
                                    "builder_relevance": true,
                                    "understandability": true,
                                    "real_world_grounding": true,
                                    "novelty_timing": true
                                  }',
  digest_lens         text        NOT NULL DEFAULT 'builder'
                                  CHECK (digest_lens IN ('founder', 'builder', 'researcher')),
  timezone_offset     FLOAT8      NOT NULL DEFAULT 0,
  digest_hour         integer     NOT NULL DEFAULT 7,
  email_digest_enabled boolean    NOT NULL DEFAULT false,
  delivery_email      text,
  webhook_url         text,
  webhook_platform    text        NOT NULL DEFAULT 'slack'
                                  CHECK (webhook_platform IN ('slack', 'discord', 'generic')),
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_configs IS
  'Notion OAuth credentials, research topic list, experience level, and '
  'digest scheduling settings for each user. One row per user.';

CREATE UNIQUE INDEX IF NOT EXISTS user_configs_user_id_key ON user_configs (user_id);

CREATE TRIGGER user_configs_set_updated_at
  BEFORE UPDATE ON user_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: pipeline_runs
-- Audit log of every daily digest run attempted for a user.
-- =============================================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  run_date        date        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending',
                                'running',
                                'complete',
                                'failed',
                                'empty'
                              )),
  papers_fetched  integer     NOT NULL DEFAULT 0,
  papers_passed   integer     NOT NULL DEFAULT 0,
  top_score       numeric(3,1),
  notion_page_url text,
  error_message   text,
  trigger_count   integer     NOT NULL DEFAULT 1,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pipeline_runs IS
  'Audit log of every daily digest pipeline run. Tracks how many papers '
  'were fetched and scored, the resulting Notion page URL, and any errors.';

CREATE INDEX IF NOT EXISTS pipeline_runs_user_id_idx  ON pipeline_runs (user_id);
CREATE INDEX IF NOT EXISTS pipeline_runs_run_date_idx ON pipeline_runs (run_date);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_runs_user_date_key ON pipeline_runs (user_id, run_date);

-- =============================================================================
-- TABLE: papers_cache
-- Deduplicated arXiv paper data fetched each day, shared across all users.
-- =============================================================================
CREATE TABLE IF NOT EXISTS papers_cache (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  arxiv_id        text  NOT NULL,
  fetch_date      date  NOT NULL,
  title           text  NOT NULL,
  authors         text,
  abstract        text,
  pdf_url         text,
  published_date  date,
  category        text,
  matched_group   text,
  raw_json        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (arxiv_id, fetch_date)
);

COMMENT ON TABLE papers_cache IS
  'Deduped arXiv papers fetched during the daily shared fetch step. '
  'Keyed on (arxiv_id, fetch_date) so the same paper can appear on '
  'multiple days without duplication within a single day.';

CREATE INDEX IF NOT EXISTS papers_cache_fetch_date_idx ON papers_cache (fetch_date);
CREATE INDEX IF NOT EXISTS papers_cache_arxiv_id_idx   ON papers_cache (arxiv_id);

-- =============================================================================
-- TABLE: paper_rankings_cache
-- Per-user cached LLM scoring and summary fields for a given fetch date/profile.
-- =============================================================================
CREATE TABLE IF NOT EXISTS paper_rankings_cache (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  fetch_date        date        NOT NULL,
  profile_hash      text        NOT NULL,
  arxiv_id          text        NOT NULL,
  prompt_version    integer     NOT NULL DEFAULT 1,
  score             numeric(3,1),
  include           boolean     NOT NULL DEFAULT false,
  problem           text,
  approach          text,
  results           text,
  builder_takeaway  text,
  learning_path     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE paper_rankings_cache IS
  'Per-user cache of LLM ranking results keyed by fetch date, profile hash, '
  'and arXiv paper id. Used to avoid re-scoring the same papers on same-day reruns.';

CREATE UNIQUE INDEX IF NOT EXISTS paper_rankings_cache_identity_key
  ON paper_rankings_cache (user_id, fetch_date, profile_hash, arxiv_id, prompt_version);

CREATE INDEX IF NOT EXISTS paper_rankings_cache_lookup_idx
  ON paper_rankings_cache (user_id, fetch_date, profile_hash);

CREATE TRIGGER paper_rankings_cache_set_updated_at
  BEFORE UPDATE ON paper_rankings_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- =============================================================================
-- TABLE: user_delivered_papers
-- Permanent record of every arXiv paper delivered to each user across all days.
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

-- =============================================================================
-- TABLE: guest_sessions
-- Server-side session revocation for guest / Notion-first authentication.
-- =============================================================================
CREATE TABLE IF NOT EXISTS guest_sessions (
  jti         UUID        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

COMMENT ON TABLE guest_sessions IS
  'Server-side session tracking for guest (Notion-first) tokens to support revocation.';

CREATE INDEX IF NOT EXISTS guest_sessions_jti_active_idx
  ON guest_sessions (jti)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS guest_sessions_user_id_idx
  ON guest_sessions (user_id);

-- =============================================================================
-- TABLE: digests
-- Daily summarized papers per user for in-app Web Digest reader viewing.
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

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_configs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_rankings_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_delivered_papers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests                ENABLE ROW LEVEL SECURITY;

-- users — match directly on clerk_id exposed by Clerk JWT
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users
  FOR SELECT USING (clerk_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (clerk_id = auth.jwt() ->> 'sub');

-- user_configs — join to users via user_id
DROP POLICY IF EXISTS user_configs_select_own ON user_configs;
CREATE POLICY user_configs_select_own ON user_configs
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS user_configs_update_own ON user_configs;
CREATE POLICY user_configs_update_own ON user_configs
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- pipeline_runs — join to users via user_id
DROP POLICY IF EXISTS pipeline_runs_select_own ON pipeline_runs;
CREATE POLICY pipeline_runs_select_own ON pipeline_runs
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- papers_cache — readable by all authenticated users (shared, non-sensitive)
DROP POLICY IF EXISTS papers_cache_select_authenticated ON papers_cache;
CREATE POLICY papers_cache_select_authenticated ON papers_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- user_delivered_papers — users can read their own delivery history
DROP POLICY IF EXISTS user_delivered_papers_select_own ON user_delivered_papers;
CREATE POLICY user_delivered_papers_select_own ON user_delivered_papers
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- digests — users can read their own daily in-app digests
DROP POLICY IF EXISTS digests_select_own ON digests;
CREATE POLICY digests_select_own ON digests
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- =============================================================================
-- TABLE: paper_feedback
-- Users can rate papers ('more' like this or 'less' like this) to personalize
-- their future digests.
-- =============================================================================
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

ALTER TABLE paper_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paper_feedback_select_own ON paper_feedback;
CREATE POLICY paper_feedback_select_own ON paper_feedback
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS paper_feedback_insert_own ON paper_feedback;
CREATE POLICY paper_feedback_insert_own ON paper_feedback
  FOR INSERT WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS paper_feedback_update_own ON paper_feedback;
CREATE POLICY paper_feedback_update_own ON paper_feedback
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  ) WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS paper_feedback_delete_own ON paper_feedback;
CREATE POLICY paper_feedback_delete_own ON paper_feedback
  FOR DELETE USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- user_configs — minimal anon read for GitHub Actions scheduling check gate
GRANT SELECT (digest_hour, timezone_offset)
  ON user_configs
  TO anon;

DROP POLICY IF EXISTS user_configs_anon_scheduling_read ON user_configs;
CREATE POLICY user_configs_anon_scheduling_read
  ON user_configs
  FOR SELECT
  TO anon
  USING (active = true);

