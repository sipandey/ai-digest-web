-- =============================================================================
-- Migration: guest auth (Notion-first setup, no Clerk required)
--
-- Allows users to set up their digest by connecting Notion only — no email
-- or password required.  Clerk-based email accounts continue to work unchanged.
--
-- Changes:
--   users.clerk_id      — made nullable (Notion-first users have no Clerk ID)
--   users.email         — made nullable (Notion-first users may skip email)
--   users.notion_bot_id — new UNIQUE column; the Notion integration bot ID
--                         returned by GET /v1/users/me with the integration
--                         token.  Stable per integration; used as identity
--                         for Notion-first users and for account linking when
--                         they later sign up with email.
-- =============================================================================

-- 1. Make clerk_id nullable (existing rows keep their values)
ALTER TABLE users ALTER COLUMN clerk_id DROP NOT NULL;

-- 2. Make email nullable (existing rows keep their values)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 3. Add notion_bot_id for Notion-first identity
ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_bot_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_notion_bot_id_key ON users (notion_bot_id)
  WHERE notion_bot_id IS NOT NULL;

COMMENT ON COLUMN users.notion_bot_id IS
  'Notion bot user ID returned by GET /v1/users/me with the integration token. '
  'Unique per Notion integration. Used as the stable identity for Notion-first '
  '(no-account) users, and to link accounts when they later sign up with email.';
