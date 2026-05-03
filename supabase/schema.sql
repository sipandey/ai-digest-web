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
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id    text        UNIQUE NOT NULL,
  email       text        UNIQUE NOT NULL,
  name        text,
  tier        text        NOT NULL DEFAULT 'free'
                          CHECK (tier IN ('free', 'pro')),
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
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
                                    "novelty": true
                                  }',
  timezone_offset     integer     NOT NULL DEFAULT 0,
  digest_hour         integer     NOT NULL DEFAULT 7,
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
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pipeline_runs IS
  'Audit log of every daily digest pipeline run. Tracks how many papers '
  'were fetched and scored, the resulting Notion page URL, and any errors.';

CREATE INDEX IF NOT EXISTS pipeline_runs_user_id_idx  ON pipeline_runs (user_id);
CREATE INDEX IF NOT EXISTS pipeline_runs_run_date_idx ON pipeline_runs (run_date);

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
-- Row Level Security
-- =============================================================================

ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_configs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers_cache  ENABLE ROW LEVEL SECURITY;

-- users — match directly on clerk_id exposed by Clerk JWT
CREATE POLICY users_select_own ON users
  FOR SELECT USING (clerk_id = auth.jwt() ->> 'sub');

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (clerk_id = auth.jwt() ->> 'sub');

-- user_configs — join to users via user_id
CREATE POLICY user_configs_select_own ON user_configs
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY user_configs_update_own ON user_configs
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- pipeline_runs — join to users via user_id
CREATE POLICY pipeline_runs_select_own ON pipeline_runs
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );

-- papers_cache — readable by all authenticated users (shared, non-sensitive)
CREATE POLICY papers_cache_select_authenticated ON papers_cache
  FOR SELECT USING (auth.role() = 'authenticated');
