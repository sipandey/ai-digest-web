# AI Digest — Backlog

Items that are known, understood, and deliberately deferred.
Pick them up in priority order when ready.

---

## 🔴 Security / Abuse (High Priority)

### 1. Replace in-memory rate limiter with distributed enforcement
**File:** `web/lib/ratelimit.ts`  
**Problem:** The `rateLimit()` function stores state in a `Map` in process memory. On Vercel each serverless invocation can be a fresh instance, so the store is empty and every request is allowed. The 5/min limits on `/api/guest/setup`, `/api/guest/verify`, and `/api/users/test-notion` are effectively non-functional in production.  
**Fix:** Swap the `Map` for [Upstash Redis + @upstash/ratelimit](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview). One free Upstash database is sufficient. All existing `rateLimit()` call sites stay the same — only the implementation changes.  
**Impact:** Blocks burst account-creation attacks and token-probing via the test-notion endpoint.

---

### 2. Email verification before first pipeline run
**Files:** `web/app/api/guest/setup/route.ts`, `web/app/api/pipeline/trigger/route.ts`  
**Problem:** Guest (Notion-first) users have no email required. One person can create unlimited accounts using different Notion integration tokens (each produces a unique `notion_bot_id`). With the current 3-runs/day cap, 10 fake accounts = 30 pipeline runs/day ≈ $30 OpenAI spend.  
**Fix options (pick one):**
- Require a verified email before the first pipeline run is allowed. Send a one-time verification link via Resend / Postmark. Block `/api/pipeline/trigger` until `users.email_verified = true`.
- Or: require an invite code during guest setup (simpler for closed beta).  
**Schema change needed:** `ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;`

---

### 3. System-wide daily pipeline run budget / circuit breaker
**File:** `web/app/api/pipeline/trigger/route.ts`  
**Problem:** No cap on total pipeline runs across all users. Unexpected viral growth or a single multi-account abuser could cause large OpenAI bills before you notice.  
**Fix:** Add a `daily_budget_runs` config value (e.g. 200). On each trigger, count `pipeline_runs WHERE run_date = today AND trigger_count >= 1`. If total ≥ budget, return 503 with a friendly message. Check can be done cheaply with a `COUNT(*)` on `pipeline_runs`.  
**Alternative:** Set a hard spend limit in the OpenAI dashboard (now available under Limits).

---

## 🟡 Infrastructure (Medium Priority)

### 4. Supabase migrations are not auto-applied on deploy
**Directory:** `supabase/migrations/`  
**Problem:** Migrations are SQL files committed to the repo but must be run manually in the Supabase SQL Editor. It's easy to forget, and the production DB can silently fall behind the schema the code expects (this already caused the `trigger_count` column to be missing on deploy).  
**Fix:** Set up [Supabase CLI + GitHub Actions](https://supabase.com/docs/guides/cli/managing-environments) to run `supabase db push` automatically on merge to `main`. Requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` as GitHub secrets.

---

### 5. No monitoring / alerting on pipeline failures
**Problem:** If the daily pipeline cron fails silently (GitHub Actions failure, OpenAI error, Notion 429), users get no digest and no notification. You find out only when a user complains.  
**Fix options:**
- Add a GitHub Actions step that posts to a Slack/Discord webhook on workflow failure.
- Or: add a `/api/admin/pipeline-health` endpoint that checks for users with `notion_connected = true` who have no `complete` run in the last 48h, and wire it to an uptime monitor (Better Uptime / Cronitor).

---

### 6. Notion token stored in plaintext in user_configs
**Column:** `user_configs.notion_token`  
**Problem:** The Notion integration token is stored as plaintext text in Postgres. If the database is compromised the tokens are immediately usable.  
**Fix:** Encrypt at the application layer before write, decrypt on read. Use `AES-256-GCM` with a `NOTION_TOKEN_ENCRYPTION_KEY` env var. Supabase Vault (available on Pro plan) is an alternative.  
**Note:** Supabase already encrypts data at rest at the storage level, so this is a defence-in-depth measure rather than an urgent gap.

---

## 🟢 UX / Product (Lower Priority)

### 7. Buy Me a Coffee / support link
**Status:** Was planned but deferred while higher-priority fixes were in progress.  
**Placement:** Three locations identified —
1. Landing page footer (next to GitHub / Privacy)
2. SetupForm success / done state
3. Dashboard bottom, below run history  
**URL:** `https://buymeacoffee.com/sidpandey` (confirm before shipping)  
**Implementation:** Simple `<a>` tag with the yellow BMC button SVG or plain text link. No SDK needed.

---

### 8. og:image for social sharing
**File:** `web/app/layout.tsx` (lines commented out)  
**Problem:** The `openGraph.images` and `twitter.images` fields are commented out pending an actual image.  
**Fix:** Create a 1200×630 PNG at `web/public/og-image.png`, then uncomment the two `images:` lines in `layout.tsx`.

---
