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
│   │   ├── layout.tsx                  Root layout — ClerkProvider + Inter font
│   │   ├── page.tsx                    Public landing page
│   │   ├── signup/[[...rest]]/page.tsx Clerk SignUp component (catch-all)
│   │   ├── login/[[...rest]]/page.tsx  Clerk SignIn component (catch-all)
│   │   ├── dashboard/page.tsx          Daily digest status + run history (auto-refreshes while active)
│   │   ├── onboarding/page.tsx         Multi-step setup (profile → topics → Notion)
│   │   ├── settings/page.tsx           Edit profile, delivery time, timezone, Notion
│   │   └── api/
│   │       ├── auth/webhook/       Clerk webhook — creates user rows on signup
│   │       ├── users/config/       GET + POST + PATCH user config (atomic upsert)
│   │       ├── users/runs/         GET last 7 pipeline runs
│   │       ├── users/test-notion/  Validate Notion credentials
│   │       └── pipeline/trigger/   Queue or retrigger a pipeline run
│   ├── components/
│   │   ├── OnboardingForm.tsx  Multi-step onboarding client component
│   │   ├── DashboardView.tsx   Dashboard client component with 15 s polling
│   │   └── SettingsView.tsx    Settings with live UTC delivery hint
│   ├── lib/
│   │   └── supabase.ts         supabaseAdmin (service role) + createBrowserClient()
│   ├── proxy.ts                Clerk edge middleware — route protection
│   └── .env.local.example      Required environment variables for web
├── pipeline/                   Python pipeline
│   ├── config.py               Supabase client + paginated get_active_users()
│   ├── fetcher.py              Shared arXiv fetch with papers_cache + concurrent-retry guard
│   ├── ranker.py               Five-phase ranker: dedup → shortlist → cache → score → summarize
│   ├── notion_client.py        Per-user Notion page delivery
│   ├── pipeline.py             Orchestrator — per-user scheduling, dedup, retry, JSON logging
│   ├── pipeline_config.py      All tuneable constants in one place
│   ├── requirements.txt        Runtime Python dependencies
│   ├── requirements-test.txt   Test-only dependencies (pytest, pytest-mock)
│   └── tests/
│       ├── conftest.py                      Mocks supabase package; sets dummy env vars
│       ├── test_ranker.py                   Ranker pure-function tests (31 tests)
│       ├── test_pipeline_scheduling.py      _is_user_due timezone math (14 tests)
│       ├── test_fetcher.py                  Window, keyword group, concurrent-retry (17 tests)
│       ├── test_config_pagination.py        get_active_users pagination (6 tests)
│       └── test_pipeline_deduplication.py   Cross-day dedup helpers (14 tests)
├── supabase/
│   ├── schema.sql              Full Postgres schema (6 tables) with RLS policies
│   └── migrations/
│       └── 20250504_add_user_delivered_papers.sql
├── .github/
│   └── workflows/
│       ├── daily_pipeline.yml  Two-job gate: cheap check → heavy pipeline (runs every hour)
│       └── ci.yml              pytest on every push/PR touching pipeline/
├── .env.example                All environment variables documented
└── README.md                   This file
```

## Database schema

Six tables, all with Row Level Security enabled. The pipeline uses the service-role key and bypasses RLS; the web app uses the anon key, which is restricted by the policies.

| Table | Purpose |
|-------|---------|
| `users` | One row per registered user, synced from Clerk via webhook |
| `user_configs` | Notion credentials, topics, experience level, delivery schedule |
| `pipeline_runs` | Audit log of every run attempted per user per day |
| `papers_cache` | Deduplicated daily arXiv snapshot, shared across all users |
| `paper_rankings_cache` | Per-user LLM scores and summaries, keyed on `(user_id, fetch_date, profile_hash, arxiv_id, prompt_version)` |
| `user_delivered_papers` | Permanent record of every paper delivered to each user — used to exclude already-seen papers from future digests |

## Pipeline architecture

### Per-user scheduling

The GitHub Actions workflow runs every hour. A lightweight `check` job (curl + jq, ~15 s) queries Supabase to count users whose local delivery time maps to the current UTC hour:

```
target_utc_hour = (digest_hour - timezone_offset) % 24
```

The heavy `pipeline` job only runs when `users_due > 0`, keeping idle-hour costs near zero. Manual `workflow_dispatch` bypasses the gate and always runs.

### Paper processing pipeline

Each user's papers are processed in five phases:

| Phase | What happens | Cost |
|-------|-------------|------|
| **0 — Dedup** | Load `user_delivered_papers` for this user (paginated). Remove any paper whose `arxiv_id` was already delivered on a previous day. | Free |
| **1 — Shortlist** | Python keyword overlap between paper title / abstract / matched group and the user's topics. Keeps the top 40 candidates. | Free |
| **2 — Cache** | Load any previous scores and summaries for those 40 candidates from `paper_rankings_cache` (keyed on `user_id + fetch_date + profile_hash + arxiv_id`). | Free |
| **3 — Score** | Send only cache-miss candidates to GPT-4o-mini in batches of 40. Returns score + include flag. With shortlisting, a cold run is at most 1 scoring call regardless of how many papers were fetched. | LLM |
| **4 — Summarise** | Send only papers that passed the score threshold (≥ 7.0) to GPT-4o-mini for Problem / Approach / Results / Builder Takeaway / Learning Path. | LLM |

After a successful Notion delivery, all delivered `arxiv_id`s are upserted into `user_delivered_papers` with `ignore_duplicates=True` so re-runs on the same day are always safe.

On a same-day rerun phases 2–4 are entirely free: the cache covers all candidates, LLM calls drop to zero, and the dedup set is unchanged.

### Reliability features

| Feature | Detail |
|---------|--------|
| **OpenAI retry / backoff** | Application-level `_call_openai_with_retry()` — up to 3 attempts, exponential back-off capped at 60 s. SDK-level `max_retries=3` handles transient network errors below the application layer. |
| **Concurrent fetch guard** | After a cache miss in `fetch_papers()`, wait 5 s then recheck before starting an arXiv crawl. Prevents two pipeline workers downloading the same day's papers simultaneously. |
| **Batch file cleanup** | Both the input file and output file uploaded to the OpenAI Batch API are deleted after results are retrieved, keeping your OpenAI storage quota clear. |
| **Paginated user load** | `get_active_users()` fetches user configs in pages of 1 000 so the result is never silently truncated on large deployments. |
| **Atomic config save** | `saveUserConfig` in the web API uses a single Supabase upsert on `user_id` instead of a SELECT + conditional INSERT/UPDATE, eliminating the race window on concurrent saves. |
| **Structured logging** | JSON-format logs inside GitHub Actions (grep-able, log-shippable), human-readable plain text locally. Controlled by the `GITHUB_ACTIONS` env var that Actions sets automatically. |

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
3. Copy from **Project Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Clerk

1. Create a new application at [clerk.com](https://clerk.com)
2. Copy from **API Keys**:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
3. Go to **Webhooks → Add endpoint**:
   - URL: `https://your-domain.com/api/auth/webhook`
   - Subscribe to the `user.created` event
   - Copy the **Signing Secret** → `CLERK_WEBHOOK_SECRET`

### 3. Local web development

```bash
cd web
npm install
cp ../.env.example .env.local
# Fill in all values in .env.local
npm run dev
```

The app runs at `http://localhost:3000`.

### 4. Running the pipeline locally

```bash
cd pipeline
pip install -r requirements.txt

# Create a .env file with:
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...
# OPENAI_API_KEY=...

python pipeline.py
```

**Environment variable overrides:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPELINE_RUN_DATE` | today | Override the date (ISO format, e.g. `2024-01-15`) |
| `PIPELINE_USER_ID` | all active users | Run for a single user only |
| `PIPELINE_SKIP_TIME_FILTER` | `false` | Set to `true` to ignore digest_hour / timezone_offset and run all users immediately |
| `PIPELINE_USE_BATCH` | `false` | Set to `true` to use OpenAI Batch API (50% cost, ~minutes latency) |

### 5. Running the test suite

```bash
cd pipeline
pip install -r requirements.txt -r requirements-test.txt
python -m pytest tests/ -v
```

92 tests across 5 files. No live credentials required — the test suite mocks the Supabase package and OpenAI client.

CI runs automatically on every push or PR that touches `pipeline/` via `.github/workflows/ci.yml`.

### 6. GitHub Actions secrets

Add these in **GitHub → Repository → Settings → Secrets → Actions**:

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | OpenAI API key — shared across all users for GPT-4o-mini scoring |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — bypasses RLS for pipeline operations |

Notion tokens and database IDs are stored per-user in Supabase and do **not** need to be GitHub secrets.

### 7. Deploying

**Web app — Vercel:**
1. Connect the GitHub repository to a new Vercel project
2. Set the **Root Directory** to `web`
3. Add all variables from `web/.env.local.example` in **Project Settings → Environment Variables**
4. Deploy — Vercel auto-deploys on every push to `main`

For the in-app **Run now** button on Vercel, also set:
- `PIPELINE_TRIGGER_MODE=github_actions`
- `PIPELINE_GITHUB_TOKEN` — GitHub token with `workflow` permission
- `PIPELINE_GITHUB_REPOSITORY` — `owner/repo`
- `PIPELINE_GITHUB_WORKFLOW_ID=daily_pipeline.yml`
- `PIPELINE_GITHUB_REF=main`

**Pipeline — GitHub Actions:**
The workflow at `.github/workflows/daily_pipeline.yml` runs every hour. The lightweight `check` job gates the expensive `pipeline` job so compute is only consumed when users are actually due. Enable Actions on the repository and add the three secrets above.

**Local Run Now (dev only):**
```bash
# web/.env.local
PIPELINE_TRIGGER_MODE=direct
OPENAI_API_KEY=your_openai_key
PIPELINE_PYTHON_BIN=python3
```
In direct mode the route spawns `pipeline/pipeline.py` for the current user, useful for end-to-end debugging without GitHub Actions.

## Applying database migrations

When pulling updates that include new migration files under `supabase/migrations/`, run each new file in the Supabase SQL Editor in filename order before deploying the corresponding code changes.

```
supabase/migrations/
└── 20250504_add_user_delivered_papers.sql   ← run this if upgrading from initial schema
```

## Adding your first user

Sign up through `/signup` — the Clerk webhook creates the `users` and `user_configs` rows automatically. For manual testing before the web app is deployed:

```sql
-- Step 1: insert user
INSERT INTO users (clerk_id, email, name)
VALUES ('user_clerk_id_here', 'you@example.com', 'Your Name')
RETURNING id;

-- Step 2: insert config (use the id returned above)
INSERT INTO user_configs (
  user_id, notion_token, notion_database_id, notion_connected,
  topics, profile_description, experience_level
) VALUES (
  '<id from step 1>',
  'secret_your_notion_token',
  'your_32_char_database_id',
  true,
  ARRAY['RAG and retrieval', 'AI agents', 'LLM applications'],
  'I am building a RAG chatbot and want practical papers I can implement.',
  'developer_learning_ai'
);
```

Then run `python pipeline/pipeline.py` — the user appears in `get_active_users()` and receives their first digest.

---

## Deployment checklist

**Supabase**
- [ ] Project created
- [ ] `supabase/schema.sql` executed in SQL Editor
- [ ] All migration files in `supabase/migrations/` executed in order
- [ ] RLS policies active (verify in Table Editor → RLS)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` copied

**Clerk**
- [ ] Application created
- [ ] Webhook endpoint configured pointing to `/api/auth/webhook`
- [ ] `user.created` event subscribed
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` copied

**GitHub**
- [ ] `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` added as Actions secrets
- [ ] Actions enabled on the repository
- [ ] CI workflow (`ci.yml`) passing on `main`

**Vercel**
- [ ] Repository connected, root directory set to `web/`
- [ ] All env vars from `web/.env.local.example` set in Vercel dashboard
- [ ] Deployment successful, domain accessible
- [ ] Optional: custom domain configured

**Ready:** push to `main`, enable GitHub Actions, sign up as the first user.
