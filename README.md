# AI Digest

## What this is

AI Digest is a multi-tenant SaaS application that delivers a personalised daily summary of arXiv research papers directly to your Notion workspace. Each morning the pipeline fetches every paper published in the last 24 hours across ML, NLP, CV, and AI, shortlists the most relevant candidates using keyword overlap against your topics, scores and summarises them with GPT-4o-mini, and pushes a structured digest — with Problem, Approach, Results, Builder Takeaway, and Learning Path for every paper — into a Notion database you control.

Papers you have already received are permanently tracked and never repeated in a future digest. The system is free to use.

The service is built for developers who want to stay current with AI research without drowning in the firehose. You describe what you're building in plain English, set your topics, and the system handles the rest. No arXiv categories, no manual filtering, no reading 40 abstracts before breakfast.

## Repository structure

```
ai-digest-web/
├── web/                        Next.js app (TypeScript + Tailwind + Clerk)
│   ├── app/
│   │   ├── layout.tsx                      Root layout — ClerkProvider + Inter font + OG metadata
│   │   ├── page.tsx                        Public landing page
│   │   ├── privacy/page.tsx                Privacy policy (GDPR/CCPA-aligned)
│   │   ├── terms/page.tsx                  Terms of Service
│   │   ├── signup/[[...rest]]/page.tsx     Clerk SignUp component (catch-all)
│   │   ├── login/[[...rest]]/page.tsx      Clerk SignIn component (catch-all)
│   │   ├── setup/page.tsx                  Notion-first (guest) onboarding entry point
│   │   ├── setup/verify/page.tsx           Guest re-authentication for returning users
│   │   ├── dashboard/page.tsx              Daily digest status + run history (auto-refreshes while active)
│   │   ├── onboarding/page.tsx             Multi-step setup for Clerk users (profile → topics → Notion)
│   │   ├── settings/page.tsx               Edit profile, delivery time, timezone, Notion credentials
│   │   └── api/
│   │       ├── auth/webhook/       Clerk webhook — creates/updates/hard-deletes users on Clerk events
│   │       ├── auth/logout/        Guest session logout — revokes jti + clears __digest_sid cookie
│   │       ├── guest/setup/        Notion-first signup — validates token, creates guest user + session
│   │       ├── guest/verify/       Re-issue session cookie for returning guests (token re-auth)
│   │       ├── users/config/       GET + POST + PATCH user config (atomic upsert, input validated)
│   │       ├── users/runs/         GET last 7 pipeline runs
│   │       ├── users/test-notion/  Validate Notion credentials without saving (rate-limited)
│   │       └── pipeline/trigger/   Queue or retrigger a pipeline run (3 runs/day cap, system budget)
│   ├── components/
│   │   ├── BottomNav.tsx       Mobile bottom navigation bar
│   │   ├── DashboardView.tsx   Dashboard client component with polling
│   │   ├── ErrorBoundary.tsx   React error boundary for graceful error display
│   │   ├── OnboardingForm.tsx  Multi-step onboarding client component (Clerk users)
│   │   ├── SettingsView.tsx    Settings with live UTC delivery hint
│   │   └── SetupForm.tsx       Notion-first guest onboarding client component
│   ├── lib/
│   │   ├── auth.ts             Unified auth — resolves user from Clerk JWT or __digest_sid cookie
│   │   ├── encryption.ts       AES-256-GCM encrypt/decrypt for Notion credentials (Web Crypto API)
│   │   ├── guest-sessions.ts   Server-side session persistence + jti-based revocation
│   │   ├── notion.ts           Notion database ID validation + normalisation helpers
│   │   ├── ratelimit.ts        Upstash Redis sliding-window rate limiter (in-memory fallback for dev)
│   │   ├── session.ts          HMAC-SHA256 signed session tokens with jti for guest users
│   │   ├── supabase.ts         supabaseAdmin (service role) — server-only, never exposed to browser
│   │   └── __tests__/          Vitest test suite (93 tests)
│   │       ├── setup.ts
│   │       ├── session.test.ts
│   │       ├── guest-sessions.test.ts
│   │       ├── proxy.test.ts
│   │       └── logout.test.ts
│   ├── scripts/
│   │   └── encrypt-existing-tokens.mjs   One-time backfill — encrypts plaintext Notion tokens in DB
│   ├── public/
│   │   └── og-image.png        1200×630 Open Graph / Twitter Card image
│   ├── proxy.ts                Edge middleware — CSP nonce, route protection (Clerk + guest cookie)
│   ├── next.config.ts          Static security headers (HSTS, X-Frame-Options, etc.)
│   └── vitest.config.ts        Vitest config (node environment, path aliases)
├── pipeline/                   Python pipeline
│   ├── config.py               Supabase client + paginated get_active_users() with decryption
│   ├── encryption.py           Python AES-256-GCM decrypt for Notion credentials
│   ├── fetcher.py              Shared arXiv fetch with papers_cache + concurrent-retry guard
│   ├── ranker.py               Five-phase ranker: dedup → shortlist → cache → score → summarize
│   ├── notion_client.py        Per-user Notion page delivery
│   ├── pipeline.py             Orchestrator — per-user scheduling, dedup, retry, JSON logging
│   ├── pipeline_config.py      All tuneable constants in one place (PROMPT_VERSION, thresholds, etc.)
│   ├── requirements.txt        Runtime Python dependencies
│   ├── requirements-test.txt   Test-only dependencies (pytest, pytest-mock)
│   └── tests/
│       ├── conftest.py                      Mocks supabase package; sets dummy env vars
│       ├── test_ranker.py                   Ranker pure-function tests — sanitization, scoring, formatting
│       ├── test_pipeline_scheduling.py      _is_user_due timezone math
│       ├── test_fetcher.py                  Window, keyword group, concurrent-retry
│       ├── test_config_pagination.py        get_active_users pagination
│       └── test_pipeline_deduplication.py   Cross-day dedup helpers
├── supabase/
│   ├── schema.sql              Full Postgres schema (7 tables) with RLS policies
│   └── migrations/
│       ├── 20250504_add_user_delivered_papers.sql
│       ├── 20250504_guest_auth.sql
│       ├── 20250505_scoring_priorities_and_pipeline_runs.sql
│       ├── 20250506_fix_notion_bot_id_constraint.sql
│       ├── 20250506_pipeline_runs_trigger_count.sql
│       ├── 20250508_timezone_offset_float.sql
│       ├── 20250513_timezone_offset_float8.sql
│       ├── 20250513_anon_scheduling_read.sql   ← anon key RLS for check job
│       └── 20250513_guest_sessions.sql         ← server-side session revocation table
├── .github/
│   └── workflows/
│       ├── daily_pipeline.yml  Two-job gate: cheap check → heavy pipeline (runs every hour)
│       └── ci.yml              pytest on every push/PR touching pipeline/
├── .env.example                All environment variables documented
└── README.md                   This file
```

## Authentication model

The app supports two sign-in paths:

### Clerk users (email/password)

Standard Clerk auth. On `user.created`, the webhook at `/api/auth/webhook` upserts the `users` and `user_configs` rows. On `user.updated` it syncs email and name changes from Clerk to Supabase. On `user.deleted` it performs a hard `DELETE` on the `users` row — all child rows cascade-delete automatically, honouring the right-to-erasure promise in the privacy policy. The Clerk JWT is validated server-side in all API routes via `getAuthUserId()` in `lib/auth.ts`.

### Notion-first (guest) users

Users who sign up via `/setup` supply their Notion integration token directly — no Clerk account required. `POST /api/guest/setup` validates the token against Notion's API, creates a `users` row (keyed on `notion_bot_id`), encrypts and persists the Notion credentials (AES-256-GCM, `lib/encryption.ts`), and sets a `__digest_sid` cookie: an HMAC-SHA256 signed session token (30-day expiry) generated in `lib/session.ts`.

Each token contains a `jti` (UUID) claim. On issue, the jti is written to the `guest_sessions` table (`persistGuestSession`). On every subsequent API call, `getAuthUserId()` calls `isGuestSessionValid(jti)` — tokens with a revoked or expired row are rejected server-side, even if the cookie itself hasn't been cleared. On logout, `revokeGuestSession(jti)` soft-deletes the row before clearing the cookie.

Both paths share the same `getAuthUserId()` function, which tries the Clerk JWT first and falls back to the `__digest_sid` cookie. All downstream handlers are auth-method agnostic.

## Security posture

| Control | Implementation |
|---------|---------------|
| **Credential encryption** | Notion tokens and database IDs encrypted at rest with AES-256-GCM before every DB write (`lib/encryption.ts`, `pipeline/encryption.py`) |
| **Session revocation** | HMAC tokens carry a `jti`; every request checks `guest_sessions` for revocation in addition to signature + expiry |
| **CSP with nonces** | Per-request nonce in `proxy.ts`; `strict-dynamic`, no `unsafe-inline` on scripts |
| **CSRF protection** | `SameSite=Lax` on all cookies; logout additionally requires cookie presence before acting |
| **Rate limiting** | Upstash Redis sliding-window on `/api/guest/setup` (5/min), `/api/guest/verify` (10/min), `/api/users/test-notion` (10/min) |
| **Input validation** | Server-side validation on all user-facing fields before DB write |
| **Prompt injection** | Paper text sanitised (`&lt;`/`&gt;`), wrapped in XML delimiters, system message instructs model to treat as untrusted data |
| **Spend cap** | System-wide 200-run daily circuit breaker; per-user 3 manual runs/day cap |
| **GDPR** | Hard-delete on `user.deleted` webhook; full cascade removes all user data |

## Database schema

Seven tables, all with Row Level Security enabled. The pipeline uses the service-role key and bypasses RLS; the web app API routes use the service-role key server-side only (there is no browser Supabase client).

| Table | Purpose |
|-------|---------|
| `users` | One row per registered user — `clerk_id` for Clerk users, `notion_bot_id` for guests |
| `user_configs` | Notion credentials (encrypted), topics, experience level, delivery schedule, scoring priorities |
| `guest_sessions` | Server-side session revocation — `jti` PK, `user_id` FK, `expires_at`, `revoked_at` |
| `pipeline_runs` | Audit log of every run attempted per user per day, including `trigger_count` |
| `papers_cache` | Deduplicated daily arXiv snapshot, shared across all users |
| `paper_rankings_cache` | Per-user LLM scores and summaries, keyed on `(user_id, fetch_date, profile_hash, arxiv_id, prompt_version)` |
| `user_delivered_papers` | Permanent record of every paper delivered to each user — used to exclude already-seen papers from future digests |

## Pipeline architecture

### Per-user scheduling

The GitHub Actions workflow runs every hour. A lightweight `check` job (curl + jq, ~15 s) queries Supabase to count users whose local delivery time maps to the current UTC hour:

```
target_utc_hour = round_half_away(digest_hour - timezone_offset) % 24
```

Half-hour timezone offsets (e.g. IST UTC+5:30, stored as 5.5) are handled by rounding the raw difference before the modulo. The `check` job uses `jq`'s `round()` and the Python pipeline uses a matching `_round_half_away()` so both compute the same target hour.

The heavy `pipeline` job only runs when `users_due > 0`, keeping idle-hour costs near zero. The `check` job captures the current UTC hour once and passes it to the pipeline job — avoiding the edge case where pip install (2–5 min startup) would otherwise push Python into the next clock hour. Manual `workflow_dispatch` bypasses the gate and always runs.

### Paper processing pipeline

Each user's papers are processed in five phases:

| Phase | What happens | Cost |
|-------|-------------|------|
| **0 — Dedup** | Load `user_delivered_papers` for this user (paginated). Remove any paper whose `arxiv_id` was already delivered on a previous day. | Free |
| **1 — Shortlist** | Python keyword overlap between paper title / abstract / matched group and the user's topics. Keeps the top 40 candidates. | Free |
| **2 — Cache** | Load any previous scores and summaries for those 40 candidates from `paper_rankings_cache` (keyed on `user_id + fetch_date + profile_hash + arxiv_id + prompt_version`). | Free |
| **3 — Score** | Send only cache-miss candidates to GPT-4o-mini in batches of 40. Returns score + include flag. With shortlisting, a cold run is at most 1 scoring call regardless of how many papers were fetched. | LLM |
| **4 — Summarise** | Send only papers that passed the score threshold (≥ 7.0) to GPT-4o-mini for Problem / Approach / Results / Builder Takeaway / Learning Path. | LLM |

After a successful Notion delivery, all delivered `arxiv_id`s are upserted into `user_delivered_papers` with `ignore_duplicates=True` so re-runs on the same day are always safe.

On a same-day rerun phases 2–4 are entirely free: the cache covers all candidates, LLM calls drop to zero, and the dedup set is unchanged.

### Manual run limits

Users can trigger pipeline runs manually from the dashboard ("Run Now"):

- **3 runs per day cap** — enforced via the `trigger_count` column on `pipeline_runs` (DB-based, works across serverless instances)
- **5-minute cooldown** — after a successful run completes, another cannot start for 5 minutes
- **System budget** — a system-wide 200-run/day circuit breaker prevents runaway spend from multi-account abuse
- **Race condition protection** — the trigger route uses an atomic conditional UPDATE that only succeeds if the run's status is terminal; concurrent requests are safely rejected

### Reliability features

| Feature | Detail |
|---------|--------|
| **OpenAI retry / backoff** | Application-level `_call_openai_with_retry()` — up to 3 attempts, exponential back-off capped at 60 s. SDK-level `max_retries=3` handles transient network errors below the application layer. |
| **Concurrent fetch guard** | After a cache miss in `fetch_papers()`, wait 5 s then recheck before starting an arXiv crawl. Prevents two pipeline workers downloading the same day's papers simultaneously. |
| **Batch file cleanup** | Both the input file and output file uploaded to the OpenAI Batch API are deleted after results are retrieved, keeping your OpenAI storage quota clear. |
| **Paginated user load** | `get_active_users()` fetches user configs in pages of 1 000 so the result is never silently truncated on large deployments. |
| **Atomic config save** | `saveUserConfig` in the web API uses a single Supabase upsert on `user_id` instead of a SELECT + conditional INSERT/UPDATE, eliminating the race window on concurrent saves. |
| **Structured logging** | JSON-format logs inside GitHub Actions (grep-able, log-shippable), human-readable plain text locally. Controlled by the `GITHUB_ACTIONS` env var that Actions sets automatically. |
| **Fatal-error recovery** | If the pipeline crashes before the per-user loop (e.g. arXiv fetch fails), `_fail_pending_runs()` marks any `pending` or `running` rows as `failed` so the dashboard doesn't poll forever. |

### Sample log output (warm run)

```
Shortlist     : 87 → 40 papers | cutoff overlap=1 | 12 dropped (12 with zero overlap)
Cross-day dedup: 15 papers excluded (already delivered), 72 remaining
Cache lookup  : 40/40 candidates hit (9 complete, 31 rejected, 0 score-only, 0 misses)
Scoring       : 0 LLM call(s) for 0 papers (3 call(s) saved vs cold baseline, 0 newly passed)
Summarization : 0 LLM call(s) for 0 papers (9 served from cache)
Total         : 0 LLM call(s) | ~3 call(s) saved by shortlist+cache | 40/40 candidates zero-LLM | 9/40 passed (from 72 fresh papers)
Delivered papers recorded: 9 arxiv_ids for 2024-01-02
```

## Setup instructions

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/schema.sql`
3. Run all migration files in `supabase/migrations/` in filename order
4. Copy from **Project Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - **`service_role` secret key** → `SUPABASE_SERVICE_ROLE_KEY`
   - **`anon` public key** → `SUPABASE_ANON_KEY` (GitHub Actions secret only — not needed in the web app)

> `NEXT_PUBLIC_SUPABASE_ANON_KEY` is **not** used by the web app. All Supabase access goes through server-side API routes using the service role key. The anon key is only needed for the GitHub Actions scheduling `check` job.

### 2. Clerk

1. Create a new application at [clerk.com](https://clerk.com)
2. Copy from **API Keys**:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
3. Go to **Webhooks → Add endpoint**:
   - URL: `https://your-domain.com/api/auth/webhook`
   - Subscribe to **`user.created`**, **`user.updated`**, and **`user.deleted`** events
   - Copy the **Signing Secret** → `CLERK_WEBHOOK_SECRET`

> `user.updated` is required to keep email and name in sync when users update their Clerk profile.

### 3. Guest session + encryption keys

Generate secrets for the guest session cookie signing and Notion credential encryption:

```bash
openssl rand -hex 32   # → GUEST_SESSION_SECRET
openssl rand -hex 32   # → NOTION_TOKEN_ENCRYPTION_KEY
```

Both values must be set in every environment where the web app runs (local, Vercel) **and** `NOTION_TOKEN_ENCRYPTION_KEY` must also be set in GitHub Actions secrets so the pipeline can decrypt Notion tokens at runtime.

### 4. Upstash Redis (rate limiting)

1. Create a free database at [upstash.com](https://upstash.com)
2. Copy from **Console → REST API**:
   - **REST URL** → `UPSTASH_REDIS_REST_URL`
   - **REST Token** → `UPSTASH_REDIS_REST_TOKEN`

If these are absent, the app falls back to per-instance in-memory rate limiting (works for local dev, but not reliable on Vercel's serverless runtime).

### 5. Local web development

```bash
cd web
npm install
cp ../.env.example .env.local
# Fill in all values in .env.local
npm run dev
```

The app runs at `http://localhost:3000`.

**Run the test suite:**

```bash
cd web
# Requires Node 22 for vitest 4 (rolldown uses require() of ES modules)
~/.nvm/versions/node/v22.x.x/bin/node node_modules/.bin/vitest run
```

93 tests covering session signing, guest session revocation, middleware route protection, and the logout CSRF guard.

### 6. Running the pipeline locally

```bash
cd pipeline
pip install -r requirements.txt

# Create a .env file with:
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...
# OPENAI_API_KEY=...
# NOTION_TOKEN_ENCRYPTION_KEY=...

python pipeline.py
```

**Environment variable overrides:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPELINE_RUN_DATE` | today | Override the date (ISO format, e.g. `2024-01-15`) |
| `PIPELINE_USER_ID` | all active users | Run for a single user only |
| `PIPELINE_SKIP_TIME_FILTER` | `false` | Set to `true` to ignore digest_hour / timezone_offset and run all users immediately |
| `PIPELINE_USE_BATCH` | `false` | Set to `true` to use OpenAI Batch API (50% cost, ~minutes latency) |
| `PIPELINE_UTC_HOUR` | live clock | UTC hour passed from the `check` job to avoid clock-skew on startup |

### 7. Running the test suites

**Pipeline (Python):**

```bash
cd pipeline
pip install -r requirements.txt -r requirements-test.txt
python -m pytest tests/ -v
```

160 tests across 5 files. No live credentials required — the test suite mocks the Supabase package and OpenAI client.

**Web (TypeScript):**

```bash
cd web
# Node 22 required for vitest 4
node node_modules/.bin/vitest run
```

93 tests across 4 files.

CI runs automatically on every push or PR that touches `pipeline/` via `.github/workflows/ci.yml`.

> **Note:** The web vitest suite is not yet wired into CI (backlog item E-1). Run it locally before merging changes to `web/lib/` or `web/proxy.ts`.

### 8. GitHub Actions secrets

Add these in **GitHub → Repository → Settings → Secrets → Actions**:

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | OpenAI API key — shared across all users for GPT-4o-mini scoring |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — bypasses RLS for pipeline operations |
| `SUPABASE_ANON_KEY` | Supabase anon key — used only in the lightweight scheduling `check` job |
| `NOTION_TOKEN_ENCRYPTION_KEY` | 64-hex-char AES-256 key — required to decrypt Notion tokens at pipeline runtime |

### 9. Deploying

**Web app — Vercel:**
1. Connect the GitHub repository to a new Vercel project
2. Set the **Root Directory** to `web`
3. Add all environment variables (see `.env.example`) in **Project Settings → Environment Variables**, including:
   - `NOTION_TOKEN_ENCRYPTION_KEY`
   - `GUEST_SESSION_SECRET`
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
   - `NEXT_PUBLIC_APP_URL` (your production domain, e.g. `https://aidigest.app`)
4. Deploy — Vercel auto-deploys on every push to `main`

For the in-app **Run now** button on Vercel, also set:
- `PIPELINE_TRIGGER_MODE=github_actions`
- `PIPELINE_GITHUB_TOKEN` — GitHub token with `workflow` permission
- `PIPELINE_GITHUB_REPOSITORY` — `owner/repo`
- `PIPELINE_GITHUB_WORKFLOW_ID=daily_pipeline.yml`
- `PIPELINE_GITHUB_REF=main`

**Pipeline — GitHub Actions:**
The workflow at `.github/workflows/daily_pipeline.yml` runs every hour. The lightweight `check` job gates the expensive `pipeline` job so compute is only consumed when users are actually due. Enable Actions on the repository and add the secrets listed above.

**Local Run Now (dev only):**
```bash
# web/.env.local
PIPELINE_TRIGGER_MODE=direct
OPENAI_API_KEY=your_openai_key
PIPELINE_PYTHON_BIN=python3
NOTION_TOKEN_ENCRYPTION_KEY=your_key_here
```
In direct mode the route spawns `pipeline/pipeline.py` for the current user, useful for end-to-end debugging without GitHub Actions.

**One-time backfill (first deploy only):**

If any users were created before encryption was enabled (before Legal-1 / I-3), run the backfill script once:

```bash
cd web
node scripts/encrypt-existing-tokens.mjs
```

This script reads every plaintext `notion_token` and `notion_database_id` from `user_configs`, encrypts them in place, and is idempotent (already-encrypted values are skipped).

## Applying database migrations

When pulling updates that include new migration files under `supabase/migrations/`, run each new file in the Supabase SQL Editor **in filename order** before deploying the corresponding code changes.

```
supabase/migrations/
├── 20250504_add_user_delivered_papers.sql          ← user_delivered_papers table
├── 20250504_guest_auth.sql                         ← notion_bot_id column on users
├── 20250505_scoring_priorities_and_pipeline_runs.sql ← scoring_priorities + pipeline_runs changes
├── 20250506_fix_notion_bot_id_constraint.sql       ← converts partial index to full UNIQUE constraint
├── 20250506_pipeline_runs_trigger_count.sql        ← trigger_count column on pipeline_runs
├── 20250508_timezone_offset_float.sql              ← timezone_offset to NUMERIC for half-hour zones
├── 20250513_timezone_offset_float8.sql             ← promotes timezone_offset to FLOAT8
├── 20250513_anon_scheduling_read.sql               ← anon RLS policy for GitHub Actions check job
└── 20250513_guest_sessions.sql                     ← server-side session revocation table
```

> Migrations are currently applied manually. Auto-apply via `supabase db push` in CI is tracked in backlog item I-1.

## Adding your first user

**Via the web app:** Sign up through `/signup` (Clerk) or `/setup` (Notion-first) — both paths create the `users` and `user_configs` rows automatically.

**Manual SQL (for testing without the web app):**

> Note: Notion tokens must be AES-256-GCM encrypted before inserting directly. Use the web app setup flow for real users. Manual SQL is only useful for local pipeline testing with a test account.

```sql
-- Step 1: insert user
INSERT INTO users (clerk_id, email, name)
VALUES ('user_clerk_id_here', 'you@example.com', 'Your Name')
RETURNING id;

-- Step 2: insert config — use encrypted values from encrypt-existing-tokens.mjs
-- or set notion_connected=false and go through the settings UI to add credentials
INSERT INTO user_configs (
  user_id, notion_connected,
  topics, profile_description, experience_level
) VALUES (
  '<id from step 1>',
  false,
  ARRAY['RAG and retrieval', 'AI agents', 'LLM applications'],
  'I am building a RAG chatbot and want practical papers I can implement.',
  'developer_learning_ai'
);
```

Then run `python pipeline/pipeline.py` — the user appears in `get_active_users()` once `notion_connected = true` and credentials are set.

---

## Deployment checklist

**Supabase**
- [ ] Project created
- [ ] `supabase/schema.sql` executed in SQL Editor
- [ ] All 9 migration files in `supabase/migrations/` executed in order
- [ ] RLS policies active (verify in Table Editor → RLS)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` copied

**Clerk**
- [ ] Application created
- [ ] Webhook endpoint configured pointing to `/api/auth/webhook`
- [ ] `user.created`, **`user.updated`**, and `user.deleted` events subscribed
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` copied

**Encryption + guest auth**
- [ ] `GUEST_SESSION_SECRET` generated (`openssl rand -hex 32`) and set in Vercel
- [ ] `NOTION_TOKEN_ENCRYPTION_KEY` generated (`openssl rand -hex 32`) and set in Vercel **and** GitHub Actions
- [ ] `encrypt-existing-tokens.mjs` run (if upgrading from a pre-encryption deploy)

**Upstash Redis**
- [ ] Database created at upstash.com
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set in Vercel

**GitHub Actions**
- [ ] `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `NOTION_TOKEN_ENCRYPTION_KEY` added as Actions secrets
- [ ] Actions enabled on the repository
- [ ] CI workflow (`ci.yml`) passing on `main`

**Vercel**
- [ ] Repository connected, root directory set to `web/`
- [ ] All env vars from `.env.example` set in Vercel dashboard
- [ ] `NEXT_PUBLIC_APP_URL` set to the production domain
- [ ] `PIPELINE_TRIGGER_MODE`, `PIPELINE_GITHUB_TOKEN`, `PIPELINE_GITHUB_REPOSITORY` set for Run Now
- [ ] Deployment successful, domain accessible
- [ ] OG image visible at `https://your-domain.com/og-image.png`

**Ready:** push to `main`, enable GitHub Actions, sign up as the first user.
