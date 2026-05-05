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
-- Row Level Security
-- =============================================================================

ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_configs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_rankings_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_delivered_papers  ENABLE ROW LEVEL SECURITY;

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

-- user_delivered_papers — users can read their own delivery history
CREATE POLICY user_delivered_papers_select_own ON user_delivered_papers
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub'
    )
  );
