# AI Digest Web — Manual Testing Guide

Complete end-to-end testing guide for the developer before inviting beta users.
All tests assume macOS, repo checked out locally, dev server at `localhost:3000`.

---

## Section 1: Environment and Dependencies

---

### Test 1.1 — Python dependencies

**WHAT:** Verify all Python packages install cleanly.

**WHY:** A missing or incompatible package will crash the pipeline at import time, not at run time — better to catch it now.

**HOW:**
```bash
cd pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -c "import arxiv, openai, notion_client, dotenv, supabase, requests; print('All imports OK')"
```

**EXPECTED:**
```
All imports OK
```

**IF IT FAILS:** The failing import name tells you which package is missing. Re-run `pip install <package>` individually. If `notion_client` fails, note that the package name is `notion-client` (hyphen) but the import is `notion_client` (underscore) — this is expected and fine because `notion_client.py` in this repo uses `requests` directly to avoid the naming collision.

---

### Test 1.2 — Node dependencies

**WHAT:** Verify Next.js app installs and builds without errors.

**WHY:** Missing peer deps or broken package resolutions will cause build failures on Vercel.

**HOW:**
```bash
cd web
source ~/.nvm/nvm.sh && nvm use --lts
npm install
npx tsc --noEmit
```

**EXPECTED:** `npm install` completes with no `npm ERR!` lines. `tsc` exits with no output and exit code 0.

**IF IT FAILS:** For tsc errors, read the error file and line number carefully — they are precise. For install failures, delete `node_modules/` and `package-lock.json` and re-run `npm install`.

---

### Test 1.3 — Environment variables present

**WHAT:** Verify all required env vars are set before any service is started.

**WHY:** Next.js and the pipeline will start without them but fail at the first database or API call with a cryptic error.

**HOW:**
```bash
# Web app
cd web
grep -E "^[^#]" .env.local | cut -d= -f1

# Pipeline
cd ../pipeline
grep -E "^[^#]" .env | cut -d= -f1
```

**EXPECTED (web .env.local):**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
NEXT_PUBLIC_CLERK_SIGN_IN_URL
NEXT_PUBLIC_CLERK_SIGN_UP_URL
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
```

**EXPECTED (pipeline .env):**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
```

**IF IT FAILS:** Copy `.env.example` to `web/.env.local` and `pipeline/.env` and fill in the values from the Supabase, Clerk, and OpenAI dashboards.

---

### Test 1.4 — Supabase connection from Python

**WHAT:** Verify the Python pipeline can connect to Supabase and run a query.

**WHY:** Confirms the URL and service role key are correct before running the full pipeline.

**HOW:**
```bash
cd pipeline
source .venv/bin/activate
python - <<'EOF'
from config import supabase
result = supabase.table("users").select("id").limit(1).execute()
print("Connected. Row count:", len(result.data))
EOF
```

**EXPECTED:**
```
Connected. Row count: 0
```
(or 1 if you already have a user — either is correct)

**IF IT FAILS:** `Invalid API key` → check `SUPABASE_SERVICE_ROLE_KEY`. `Connection refused` or DNS error → check `SUPABASE_URL` format (`https://xxxx.supabase.co`, no trailing slash).

---

### Test 1.5 — Supabase connection from Next.js

**WHAT:** Verify the Next.js dev server can reach Supabase.

**WHY:** The browser client uses the anon key; the server client uses the service role key — both need to be correct.

**HOW:**
```bash
cd web
npm run dev
```
Then open `http://localhost:3000/api/users/config` in a browser while **not** logged in.

**EXPECTED:**
```json
{"error":"Unauthorized"}
```
with HTTP 401. This confirms the route loaded (Supabase imported fine) and Clerk is working (returned 401, not 500).

**IF IT FAILS:** A 500 with `supabaseAdmin is not defined` or similar means the env vars are missing from `web/.env.local`. A 500 with a Supabase error means the URL or key is wrong.

---

### Test 1.6 — OpenAI API key valid

**WHAT:** Verify the OpenAI key can make a real (cheap) API call.

**WHY:** An invalid key will cause the ranker to fail silently per-batch, resulting in zero papers passing — hard to diagnose in production.

**HOW:**
```bash
cd pipeline
source .venv/bin/activate
python - <<'EOF'
import os
from dotenv import load_dotenv
load_dotenv()
from openai import OpenAI
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
r = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Reply with: OK"}],
    max_tokens=5,
)
print(r.choices[0].message.content)
EOF
```

**EXPECTED:**
```
OK
```

**IF IT FAILS:** `AuthenticationError` → key is wrong or expired. `RateLimitError` → you've hit quota; wait or add credits. `APIConnectionError` → network issue.

---

### Test 1.7 — Clerk keys valid (dev server starts)

**WHAT:** Verify the Next.js dev server starts without Clerk key errors.

**WHY:** If the publishable key is wrong, every page will show a Clerk error banner instead of your UI.

**HOW:**
```bash
cd web
npm run dev 2>&1 | head -20
```
Then visit `http://localhost:3000` in a browser.

**EXPECTED:** Terminal shows `▲ Next.js ... ready on http://localhost:3000`. Browser shows the landing page — not a Clerk error screen.

**IF IT FAILS:** If you see `@clerk/nextjs: publishableKey is invalid` in the console or browser, double-check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `web/.env.local`. It must start with `pk_test_` (development) or `pk_live_` (production).

---

## Section 2: Database (Supabase)

---

### Test 2.1 — All tables exist with correct columns

**WHAT:** Verify the schema was applied correctly and all four tables have the expected columns.

**WHY:** A partially applied schema (e.g. someone ran only part of `schema.sql`) will cause cryptic 42703 errors in the pipeline.

**HOW:** Open the Supabase **SQL Editor** and run:

```sql
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'user_configs', 'pipeline_runs', 'papers_cache')
ORDER BY table_name, ordinal_position;
```

**EXPECTED:** You should see all columns listed in `supabase/schema.sql`. Key ones to spot-check:

| Table | Column | Type |
|---|---|---|
| `users` | `clerk_id` | `text` |
| `users` | `tier` | `text` |
| `user_configs` | `notion_token` | `text` |
| `user_configs` | `scoring_priorities` | `jsonb` |
| `user_configs` | `experience_level` | `text` |
| `pipeline_runs` | `top_score` | `numeric` |
| `papers_cache` | `raw_json` | `jsonb` |

**IF IT FAILS:** Re-run `supabase/schema.sql` in the SQL Editor from scratch. If it errors with `already exists`, add `DROP TABLE IF EXISTS` statements before each `CREATE TABLE` — but only in development, never in production with real data.

---

### Test 2.2 — RLS policies active

**WHAT:** Verify Row Level Security is enabled on all four tables.

**WHY:** Without RLS, any user with the anon key can read every other user's data.

**HOW:**
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'user_configs', 'pipeline_runs', 'papers_cache');
```

**EXPECTED:**
```
tablename      | rowsecurity
---------------+------------
papers_cache   | t
pipeline_runs  | t
user_configs   | t
users          | t
```

To verify policies exist:
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**EXPECTED:** At least 2 policies per table (select + update for user-owned tables; 1 select policy for `papers_cache`).

**IF IT FAILS:** Run the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` statements from `supabase/schema.sql` manually.

---

### Test 2.3 — Insert a test user manually

**WHAT:** Insert a realistic test user to use throughout the remaining tests.

**WHY:** Simulates exactly what the Clerk webhook does; lets you test the pipeline without needing a live Clerk signup.

**HOW:** Run in Supabase SQL Editor:

```sql
-- Insert the user
INSERT INTO users (clerk_id, email, name, tier)
VALUES (
  'user_test_dev_clerk_id_001',
  'dev-test@example.com',
  'Dev Tester',
  'free'
)
RETURNING id;
```

Copy the returned `id` (a UUID), then:

```sql
-- Insert their config (replace <user_id> with the UUID above)
INSERT INTO user_configs (
  user_id,
  notion_token,
  notion_database_id,
  notion_connected,
  topics,
  profile_description,
  experience_level,
  digest_hour,
  timezone_offset
) VALUES (
  '<user_id>',
  'secret_test_notion_token_replace_with_real_one',
  'abcdef1234567890abcdef1234567890',
  true,
  ARRAY['RAG and retrieval', 'AI agents and automation', 'LLM application development'],
  'I am building a customer support chatbot using RAG. I have web development experience and am learning AI. I want papers I can build from immediately.',
  'developer_learning_ai',
  7,
  0
);
```

**EXPECTED:** Both inserts succeed with `INSERT 0 1`. You now have a test user in the database.

**IF IT FAILS:** A `unique_violation` on `clerk_id` means you already have a user with that ID — either delete it first or change the `clerk_id` value.

---

### Test 2.4 — `updated_at` trigger works

**WHAT:** Verify the `set_updated_at()` trigger fires on UPDATE.

**WHY:** The trigger keeps `updated_at` accurate without any application code — if it's broken, timestamps will be stale and you won't know when configs were last changed.

**HOW:**
```sql
-- Check current updated_at
SELECT updated_at FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001';

-- Make an update
UPDATE users SET name = 'Dev Tester Updated'
WHERE clerk_id = 'user_test_dev_clerk_id_001';

-- Check updated_at changed
SELECT updated_at FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001';
```

**EXPECTED:** The second `updated_at` value is newer than the first (typically within milliseconds).

**IF IT FAILS:** The `set_updated_at()` function or trigger was not created. Re-run the function and trigger DDL statements from `supabase/schema.sql`.

---

### Test 2.5 — Foreign key cascade works

**WHAT:** Verify that deleting a user also deletes their `user_configs` and `pipeline_runs` rows.

**WHY:** Without `ON DELETE CASCADE`, deleting a user from Clerk (and then from `users`) would leave orphaned rows that break pipeline queries.

**HOW:**
```sql
-- Insert a temporary pipeline_run for the test user
INSERT INTO pipeline_runs (user_id, run_date, status)
SELECT id, CURRENT_DATE, 'complete'
FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001';

-- Verify it exists
SELECT COUNT(*) FROM pipeline_runs pr
JOIN users u ON pr.user_id = u.id
WHERE u.clerk_id = 'user_test_dev_clerk_id_001';

-- Delete the user
DELETE FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001';

-- Verify cascade deleted user_configs and pipeline_runs
SELECT COUNT(*) FROM user_configs WHERE user_id NOT IN (SELECT id FROM users);
SELECT COUNT(*) FROM pipeline_runs WHERE user_id NOT IN (SELECT id FROM users);
```

**EXPECTED:** Both final `SELECT COUNT(*)` return `0`.

**IF IT FAILS:** The `ON DELETE CASCADE` constraints were not applied. Check `supabase/schema.sql` and re-run the `CREATE TABLE` for `user_configs` and `pipeline_runs`.

> **Note:** After this test you have deleted the test user. Re-run Test 2.3 to recreate them before continuing.

---

## Section 3: Auth (Clerk)

---

### Test 3.1 — Sign up flow

**WHAT:** Test the complete new user sign-up experience.

**WHY:** Sign up is the entry point for every user — it must work flawlessly and the webhook must fire.

**HOW:**
1. Open `http://localhost:3000` in an **incognito window**
2. Click **Get started free** — verify URL changes to `/signup`
3. Enter a real email address you can access
4. Complete the Clerk sign-up form (email verification code, password, etc.)
5. After confirming email, verify you are redirected to `/onboarding`

**EXPECTED:**
- Landing page → `/signup` on button click ✓
- Clerk sign-up component renders correctly ✓
- After completing sign-up: redirect to `/onboarding` ✓
- Clerk dashboard → **Users** shows the new user ✓

**IF IT FAILS:** If you land on `/dashboard` instead of `/onboarding`, check `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding` in `web/.env.local`. If the Clerk component does not render, check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

---

### Test 3.2 — Webhook fired correctly

**WHAT:** Verify the Clerk `user.created` webhook inserted rows in Supabase.

**WHY:** If the webhook failed, the user exists in Clerk but not in Supabase — every API route will return 404 for them.

**HOW:**
1. In **Clerk Dashboard → Webhooks → your endpoint**, check the **Logs** tab
2. Find the `user.created` event for your test signup
3. Verify it shows **200 OK** (not 400 or 500)
4. In Supabase SQL Editor, run:

```sql
SELECT u.email, u.clerk_id, uc.notion_connected, uc.topics
FROM users u
LEFT JOIN user_configs uc ON uc.user_id = u.id
WHERE u.email = 'your-test-email@example.com';
```

**EXPECTED:**
- Clerk webhook log shows `200 OK`
- Supabase query returns 1 row with `notion_connected = false` and `topics = null`

**IF IT FAILS:**
- **404 in webhook log**: Your dev server is not reachable from the internet. For local testing, use [ngrok](https://ngrok.com): `ngrok http 3000` — then update the webhook URL in Clerk to the ngrok HTTPS URL.
- **500 in webhook log**: Check `CLERK_WEBHOOK_SECRET` in `web/.env.local` — it must match the signing secret shown in the Clerk webhook detail page.
- **Supabase row missing despite 200**: The webhook handler has a bug — check terminal logs from `npm run dev`.

---

### Test 3.3 — Login flow

**WHAT:** Test logging in with an existing account.

**WHY:** Separate concern from sign-up; the redirect URL must be correct.

**HOW:**
1. Sign out if currently signed in
2. Visit `http://localhost:3000/login`
3. Enter credentials from Test 3.1
4. Submit

**EXPECTED:** Redirect to `/dashboard` after successful login. `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard` controls this.

**IF IT FAILS:** If you land somewhere else, check `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` in `web/.env.local`. If the form doesn't submit, check browser console for Clerk errors.

---

### Test 3.4 — Protected routes redirect

**WHAT:** Verify unauthenticated users are redirected to `/login`.

**WHY:** The middleware must protect these routes — if it doesn't, any visitor can access the dashboard UI (even if the API calls will 401).

**HOW:** Open a new **incognito window** (no session) and visit each URL:

```
http://localhost:3000/dashboard
http://localhost:3000/settings
http://localhost:3000/onboarding
```

**EXPECTED:** All three redirect to `http://localhost:3000/login` (or the Clerk hosted sign-in page). No page content is shown.

**IF IT FAILS:** `middleware.ts` is not being picked up. Verify the file is at `web/middleware.ts` (not inside `app/`). Restart `npm run dev` — Next.js sometimes needs a restart to pick up new middleware.

---

### Test 3.5 — Sign out

**WHAT:** Test the sign-out button on the Settings page.

**WHY:** Users must be able to sign out and the session must be fully cleared.

**HOW:**
1. Log in and navigate to `http://localhost:3000/settings`
2. Scroll to the **Account** card
3. Click **Sign out**
4. After redirect, try visiting `http://localhost:3000/dashboard`

**EXPECTED:**
- Click → redirect to `http://localhost:3000/` (landing page)
- Visiting `/dashboard` afterward → redirected to `/login`

**IF IT FAILS:** If sign-out does nothing, check browser console for a Clerk error. If you land on the wrong page after sign-out, verify `signOut({ redirectUrl: "/" })` in `SettingsView.tsx:handleSignOut`.

---

## Section 4: Python Pipeline (Standalone)

---

### Test 4.1 — Fetcher standalone

**WHAT:** Test the arXiv fetch in isolation and verify papers_cache is populated.

**WHY:** The fetcher is the most likely point of rate-limit or API shape issues — isolate it first.

**HOW:**
```bash
cd pipeline
source .venv/bin/activate
python - <<'EOF'
import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
from dotenv import load_dotenv
load_dotenv()
from datetime import date
from fetcher import fetch_papers

papers = fetch_papers(date.today().isoformat())
print(f"\nTotal papers fetched: {len(papers)}")
if papers:
    print("Sample paper:")
    import json
    print(json.dumps({k: v for k, v in papers[0].items() if k != 'raw_json'}, indent=2))
EOF
```

**EXPECTED:**
- Log lines showing each search group: `Group 'RAG and retrieval': N papers`
- `Total papers fetched: N` where N is typically **50–200** on a weekday
- Sample paper with `arxiv_id`, `title`, `abstract`, `pdf_url`, `category`, `matched_group` all populated

Verify in Supabase:
```sql
SELECT fetch_date, matched_group, COUNT(*) as count
FROM papers_cache
WHERE fetch_date = CURRENT_DATE
GROUP BY fetch_date, matched_group
ORDER BY matched_group;
```

**EXPECTED:** Rows for each of the 5 keyword groups.

**IF IT FAILS:** `ModuleNotFoundError: arxiv` → re-run `pip install -r requirements.txt`. Zero papers → arXiv may be slow; try again in 10 minutes or check `arxiv.org` is reachable.

---

### Test 4.2 — Ranker standalone

**WHAT:** Test per-user scoring with a small hardcoded paper set.

**WHY:** Isolates the OpenAI call from fetcher/Notion — confirms the prompt and JSON parsing work correctly.

**HOW:**
```bash
cd pipeline
source .venv/bin/activate
python - <<'EOF'
import logging, json
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
from dotenv import load_dotenv
load_dotenv()
from ranker import rank_papers

sample_papers = [
    {
        "arxiv_id": "2401.00001",
        "title": "Improving RAG Retrieval with Adaptive Chunking",
        "abstract": "We propose an adaptive chunking strategy for retrieval-augmented generation that improves answer quality by 15% on standard QA benchmarks. Our method dynamically segments documents based on semantic density and is compatible with any vector store. We release code and a benchmark dataset.",
        "category": "cs.CL",
        "matched_group": "RAG and retrieval",
        "pdf_url": "https://arxiv.org/pdf/2401.00001",
        "authors": "Smith J., Lee A.",
        "published_date": "2024-01-15",
    },
    {
        "arxiv_id": "2401.00002",
        "title": "Theoretical Bounds on Transformer Expressivity",
        "abstract": "We derive tight upper bounds on the expressive power of transformer architectures using circuit complexity theory. Our results show that depth-L transformers cannot compute certain boolean functions computable by depth-(L+1) transformers.",
        "category": "cs.LG",
        "matched_group": "LLM applications and fine-tuning",
        "pdf_url": "https://arxiv.org/pdf/2401.00002",
        "authors": "Zhang B.",
        "published_date": "2024-01-15",
    },
    {
        "arxiv_id": "2401.00003",
        "title": "ToolAgent: An Open-Source Framework for LLM Tool Use",
        "abstract": "We release ToolAgent, a lightweight framework for building AI agents that call external APIs. ToolAgent includes automatic retry logic, parallel tool calls, and a testing harness. We demonstrate 40% faster development time versus existing frameworks on 10 real-world tasks.",
        "category": "cs.AI",
        "matched_group": "AI agents and automation",
        "pdf_url": "https://arxiv.org/pdf/2401.00003",
        "authors": "Brown K., Patel S.",
        "published_date": "2024-01-15",
    },
]

user_config = {
    "profile_description": "I am building a customer support chatbot using RAG. I know Python and React and I am learning about vector databases and embeddings. I want papers I can implement immediately.",
    "experience_level": "developer_learning_ai",
    "topics": ["RAG and retrieval", "AI agents"],
    "scoring_priorities": {
        "builder_relevance": True,
        "understandability": True,
        "real_world_grounding": True,
        "novelty_timing": True,
    },
}

scored = rank_papers(sample_papers, user_config)
print(f"\nPapers passing threshold: {len(scored)}")
for p in scored:
    print(f"\n  [{p['score']}/10] {p['title']}")
    print(f"  Problem: {p.get('problem')}")
    print(f"  Builder takeaway: {p.get('builder_takeaway')}")
EOF
```

**EXPECTED:**
- Paper 1 (RAG chunking) and Paper 3 (ToolAgent) should score ≥ 7 for this user profile — they are practical and directly relevant
- Paper 2 (theoretical bounds) should score < 7 — not actionable for a developer
- Each scored paper has `problem`, `approach`, `results`, `builder_takeaway`, `learning_path` populated

**IF IT FAILS:** `AuthenticationError` → invalid `OPENAI_API_KEY`. `json.JSONDecodeError` → GPT-4o-mini returned non-JSON; this is rare with `response_format={"type": "json_object"}` but can happen if the model refuses. Increase temperature slightly or check the prompt.

---

### Test 4.3 — Notion client standalone

**WHAT:** Test Notion page delivery with one sample paper.

**WHY:** Confirms your Notion token, database ID, and page block structure are all correct before running the full pipeline.

**HOW:** You need a real Notion token and database ID for this test. Replace `YOUR_TOKEN` and `YOUR_DB_ID` with real values:

```bash
cd pipeline
source .venv/bin/activate
python - <<'EOF'
from dotenv import load_dotenv
load_dotenv()
from notion_client import deliver_to_notion

sample_paper = {
    "arxiv_id": "2401.00001",
    "title": "Test Paper: Improving RAG Retrieval with Adaptive Chunking",
    "authors": "Smith J., Lee A.",
    "category": "cs.CL",
    "matched_group": "RAG and retrieval",
    "published_date": "2024-01-15",
    "pdf_url": "https://arxiv.org/pdf/2401.00001",
    "score": 8.5,
    "problem": "RAG retrieval degrades with poorly chunked documents.",
    "approach": "Adaptive semantic chunking based on content density.",
    "results": "15% improvement on QA benchmarks, code released.",
    "builder_takeaway": "Replace fixed-size chunking in your RAG pipeline with this method.",
    "learning_path": "Understand cosine similarity and vector databases first.",
}

user_config = {
    "notion_token": "YOUR_TOKEN",
    "notion_database_id": "YOUR_DB_ID",
}

url = deliver_to_notion([sample_paper], user_config, "2024-01-15-test")
print(f"Page created: {url}")
EOF
```

**EXPECTED:**
- Terminal prints `Page created: https://www.notion.so/...`
- In Notion, the new page has:
  - Title: `AI Digest — 2024-01-15-test`
  - Heading: `[8.5/10] Test Paper: Improving RAG Retrieval...`
  - Metadata line: `Smith J., Lee A.  ·  cs.CL  ·  ...`
  - 5 toggle blocks: 🔍 Problem, ⚙️ Approach, 📊 Results, 🏗️ Builder Takeaway, 📚 Before Reading
  - `Read paper →` link

**IF IT FAILS:** `requests.exceptions.HTTPError: 401` → invalid Notion token. `404` → database not found or not shared with the integration. `400 body.parent.database_id should be a valid uuid` → database ID has wrong format — strip hyphens manually or use the raw 32-character ID.

---

### Test 4.4 — Full pipeline with test user

**WHAT:** Run the complete orchestrator end-to-end with the test user from Test 2.3.

**WHY:** This is the integration test that confirms all layers work together.

**HOW:**

First, update the test user's `notion_token` and `notion_database_id` to real values in Supabase:
```sql
UPDATE user_configs
SET notion_token = 'secret_your_real_token',
    notion_database_id = 'your_real_database_id'
WHERE user_id = (
  SELECT id FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001'
);
```

Then run:
```bash
cd pipeline
source .venv/bin/activate
python pipeline.py
```

**EXPECTED console output:**
```
2024-01-15 06:00:00  INFO     === Pipeline starting for 2024-01-15 ===
2024-01-15 06:00:02  INFO     Cache miss — fetching from arXiv for 2024-01-15
2024-01-15 06:00:08  INFO     Group 'RAG and retrieval': 12 papers
...
2024-01-15 06:00:15  INFO     Fetched 87 papers for 2024-01-15
2024-01-15 06:00:15  INFO     Processing 1 active user(s)
2024-01-15 06:00:15  INFO     [dev-test@example.com] Run <uuid> started
2024-01-15 06:00:22  INFO     [dev-test@example.com] 8 / 87 papers passed threshold
2024-01-15 06:00:24  INFO     Created Notion page https://www.notion.so/...
2024-01-15 06:00:24  INFO     [dev-test@example.com] Complete — 8 papers delivered, top score 8.5 → https://...
2024-01-15 06:00:24  INFO     === Pipeline complete: 1 user(s) processed, 1 succeeded, 0 failed ===
```

Verify in Supabase:
```sql
SELECT status, papers_fetched, papers_passed, top_score, notion_page_url, completed_at
FROM pipeline_runs
WHERE user_id = (SELECT id FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001')
ORDER BY created_at DESC
LIMIT 1;
```

**EXPECTED:** `status = 'complete'`, `papers_passed > 0`, `notion_page_url` contains a valid Notion URL, `completed_at` is set.

**IF IT FAILS:** See individual section tests (4.1–4.3) for targeted debugging. A `status = 'failed'` row in Supabase will have an `error_message` column — read it first.

---

### Test 4.5 — Pipeline with no active users

**WHAT:** Verify the pipeline exits cleanly when there are no users to process.

**WHY:** The cron job runs daily regardless — it must not crash on a fresh install.

**HOW:**
```sql
-- Temporarily deactivate all users
UPDATE user_configs SET active = false;
```

```bash
python pipeline.py
```

```sql
-- Restore
UPDATE user_configs SET active = true;
```

**EXPECTED:**
```
INFO     === Pipeline starting for 2024-01-15 ===
INFO     Fetched 87 papers for 2024-01-15
INFO     Processing 0 active user(s)
INFO     No active users — pipeline exiting.
```
Exit code 0. No errors.

**IF IT FAILS:** Any exception means `get_active_users()` is not handling the empty list correctly — check `config.py`.

---

### Test 4.6 — Pipeline cache behaviour

**WHAT:** Verify arXiv is only called once per day even if the pipeline runs twice.

**WHY:** Unnecessary arXiv calls waste time and risk rate limiting. The cache is the primary deduplication mechanism.

**HOW:**
```bash
# First run (cold cache)
python pipeline.py 2>&1 | grep -E "Cache|Fetched|arXiv"

# Second run (warm cache)
python pipeline.py 2>&1 | grep -E "Cache|Fetched|arXiv"
```

**EXPECTED:**
- First run: `Cache miss — fetching from arXiv for ...` then `Cached N papers for ...`
- Second run: `Cache hit: returning N papers for ...` — **no arXiv fetch log lines**

Verify in Supabase — the paper count should be identical between runs:
```sql
SELECT fetch_date, COUNT(*) FROM papers_cache
WHERE fetch_date = CURRENT_DATE
GROUP BY fetch_date;
```

**IF IT FAILS:** The `upsert` on `(arxiv_id, fetch_date)` failed silently, meaning the cache was not written. Check `fetcher.py:fetch_papers` for the `supabase.table("papers_cache").upsert(...)` call and look for any errors in the first run's output.

---

## Section 5: API Routes (Direct HTTP Testing)

### Getting a Clerk session token

All authenticated routes need a valid session token. To get one:

1. Log in to `http://localhost:3000`
2. Open **DevTools → Application tab → Cookies → localhost**
3. Find the cookie named `__session` (starts with `eyJ...`)
4. Copy the full value

Use it in curl as:
```bash
TOKEN="eyJ..."
```

---

### Test 5.1 — GET /api/users/config

**WHAT:** Retrieve the current user's config.

**HOW:**
```bash
curl -s http://localhost:3000/api/users/config \
  -H "Cookie: __session=$TOKEN" | jq .
```

**EXPECTED:**
```json
{
  "profile": {
    "email": "you@example.com",
    "name": "Your Name",
    "tier": "free"
  },
  "config": {
    "notion_connected": false,
    "topics": null,
    "experience_level": "developer_learning_ai",
    ...
  },
  "notion_connected": false
}
```

**IF IT FAILS:** `401` → token expired, get a fresh one. `404` → user row missing in Supabase, check webhook (Test 3.2). `500` → check `npm run dev` terminal for the error.

---

### Test 5.2 — POST /api/users/config

**WHAT:** Submit onboarding data (simulates completing the onboarding form).

**HOW:**
```bash
curl -s -X POST http://localhost:3000/api/users/config \
  -H "Cookie: __session=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notionToken": "secret_test_token_replace_me",
    "notionDatabaseId": "abcdef1234567890abcdef1234567890",
    "topics": ["RAG and retrieval", "AI agents"],
    "profileDescription": "Building a RAG chatbot with Python and React, learning about vector databases.",
    "experienceLevel": "developer_learning_ai"
  }' | jq .
```

**EXPECTED:**
```json
{"config": {"notion_connected": true, "topics": ["RAG and retrieval", "AI agents"], ...}}
```

Verify in Supabase:
```sql
SELECT notion_connected, topics, experience_level
FROM user_configs
JOIN users ON user_configs.user_id = users.id
WHERE users.email = 'your-email@example.com';
```

**IF IT FAILS:** `400 No valid fields to update` → check field names match the allowlist in `api/users/config/route.ts`. `500` → check terminal.

---

### Test 5.3 — PATCH /api/users/config

**WHAT:** Partial update — only topics should change, other fields stay the same.

**HOW:**
```bash
# Update topics only
curl -s -X PATCH http://localhost:3000/api/users/config \
  -H "Cookie: __session=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topics": ["multimodal AI", "AI safety"]}' | jq .config.topics

# Verify profile_description was NOT changed
curl -s http://localhost:3000/api/users/config \
  -H "Cookie: __session=$TOKEN" | jq .config.profile_description
```

**EXPECTED:**
- First response: `["multimodal AI", "AI safety"]`
- Second response: the profile description from Test 5.2 is still present

**IF IT FAILS:** If other fields were wiped, the PATCH handler is doing a full replace instead of partial update. Check `api/users/config/route.ts:PATCH` — it should only include fields from the request body in the `updates` object.

---

### Test 5.4 — POST /api/users/test-notion

**WHAT:** Test the Notion credential validator with valid, invalid token, and wrong database.

**HOW:**
```bash
# Test 1: valid credentials (use your real ones)
curl -s -X POST http://localhost:3000/api/users/test-notion \
  -H "Cookie: __session=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notionToken": "secret_YOUR_REAL_TOKEN", "notionDatabaseId": "YOUR_REAL_DB_ID"}' | jq .

# Test 2: invalid token
curl -s -X POST http://localhost:3000/api/users/test-notion \
  -H "Cookie: __session=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notionToken": "secret_invalid_token_xxxx", "notionDatabaseId": "abcdef1234567890abcdef1234567890"}' | jq .

# Test 3: valid token, wrong database
curl -s -X POST http://localhost:3000/api/users/test-notion \
  -H "Cookie: __session=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notionToken": "secret_YOUR_REAL_TOKEN", "notionDatabaseId": "00000000000000000000000000000000"}' | jq .
```

**EXPECTED:**
```json
// Test 1
{"success": true}

// Test 2
{"success": false, "error": "Invalid token — check your integration token"}

// Test 3
{"success": false, "error": "Database not found — make sure you shared the database with your integration"}
```

**IF IT FAILS:** All return `success: false` even with valid credentials → Notion API may be down, or the database ID format is wrong (must be 32 hex chars, no hyphens — the route strips hyphens automatically).

---

### Test 5.5 — GET /api/users/runs

**WHAT:** Retrieve pipeline run history.

**HOW:**
```bash
# With no runs
curl -s http://localhost:3000/api/users/runs \
  -H "Cookie: __session=$TOKEN" | jq .

# Insert a fake run in Supabase then test again
```

Insert in Supabase:
```sql
INSERT INTO pipeline_runs (user_id, run_date, status, papers_fetched, papers_passed, top_score)
SELECT id, CURRENT_DATE, 'complete', 87, 8, 8.5
FROM users WHERE email = 'your-email@example.com';
```

```bash
curl -s http://localhost:3000/api/users/runs \
  -H "Cookie: __session=$TOKEN" | jq .runs
```

**EXPECTED:**
- Before insert: `{"runs": []}`
- After insert: array with 1 run object containing `run_date`, `status`, `papers_fetched`, `papers_passed`, `top_score`

**IF IT FAILS:** `404` → user not in Supabase. Empty array after insert → check the `user_id` in the insert matches the logged-in user.

---

### Test 5.6 — POST /api/pipeline/trigger

**WHAT:** Queue a manual pipeline run and verify the duplicate guard.

**HOW:**
```bash
# First trigger — should succeed
curl -s -X POST http://localhost:3000/api/pipeline/trigger \
  -H "Cookie: __session=$TOKEN" | jq .

# Second trigger same day — should fail
curl -s -X POST http://localhost:3000/api/pipeline/trigger \
  -H "Cookie: __session=$TOKEN" | jq .
```

Verify in Supabase:
```sql
SELECT status, run_date, created_at FROM pipeline_runs
WHERE run_date = CURRENT_DATE
ORDER BY created_at DESC;
```

**EXPECTED:**
```json
// First call
{"success": true, "runId": "<uuid>", "message": "Your digest is being generated..."}

// Second call
{"error": "Already ran today", "status": "pending"}
```
Supabase shows exactly 1 row for today with `status = 'pending'`.

**IF IT FAILS:** `400 Notion not connected` → complete onboarding first or set `notion_connected = true` in SQL. Two rows inserted → the duplicate check query has a bug.

---

### Test 5.7 — Unauthenticated requests

**WHAT:** Verify all API routes return 401 without a valid session.

**HOW:**
```bash
for route in \
  "GET /api/users/config" \
  "GET /api/users/runs" \
  "POST /api/users/test-notion" \
  "POST /api/pipeline/trigger"; do
  method=$(echo $route | cut -d' ' -f1)
  path=$(echo $route | cut -d' ' -f2)
  status=$(curl -s -o /dev/null -w "%{http_code}" -X $method http://localhost:3000$path)
  echo "$route → $status"
done
```

**EXPECTED:**
```
GET /api/users/config → 401
GET /api/users/runs → 401
POST /api/users/test-notion → 401
POST /api/pipeline/trigger → 401
```

**IF IT FAILS:** Any route returning 200 or 500 instead of 401 means the `auth()` check is missing or the middleware isn't protecting it. Verify `middleware.ts` includes `/(api|trpc)(.*)` in the matcher.

---

## Section 6: Web Application (Browser Testing)

---

### Test 6.1 — Landing page

**WHAT:** Verify all landing page sections render and interactive elements work.

**HOW:**
1. Open `http://localhost:3000` (logged out)
2. Verify all four sections render: Hero, How it works, What you get, Pricing
3. Click **Get started free** — verify navigates to `/signup`
4. Go back. Click **See how it works** — verify page scrolls smoothly to the `#how` section
5. Open DevTools → Toggle device mode → select **iPhone SE (375×667)**
6. Verify hero text is readable, buttons are full-width, cards stack vertically

**EXPECTED:** No horizontal scrollbar, no overlapping text at 375px. All navigation works.

**IF IT FAILS:** Layout issues at mobile → a Tailwind class is missing a `sm:` or `md:` breakpoint prefix. Navigation issues → check `href` values in `web/app/page.tsx`.

---

### Test 6.2 — Onboarding Step 1

**WHAT:** Test profile description validation and experience level selection.

**HOW:**
1. Sign in and navigate to `http://localhost:3000/onboarding`
2. Click **Next** immediately (empty form) — verify button is disabled (greyed out)
3. Type 49 characters in the textarea — verify character counter shows red `49 / 50`
4. Type 1 more character — verify counter turns green
5. Click each radio button — verify selection changes visually
6. Click **Next** — verify Step 2 appears and progress bar advances

**EXPECTED:** Next button is disabled until 50+ characters. Counter colour changes at exactly 50. Back from Step 2 → Step 1 shows preserved text and radio selection.

**IF IT FAILS:** Button not disabling → check `step1Valid` condition in `OnboardingForm.tsx`. State not preserved → the `form` state object is being reset; look for erroneous `setForm` calls.

---

### Test 6.3 — Onboarding Step 2

**WHAT:** Test the topic pill interface including limits and suggestions.

**HOW:**
1. Add a topic by typing and pressing **Enter** — verify pill appears
2. Add 4 more topics (total 5) — verify `5 / 5 topics` counter
3. Try to add a 6th topic — verify button disabled and error message appears
4. Click × on a pill — verify it is removed
5. Click one of the 3 suggested topic buttons — verify it is added as a pill and disappears from suggestions
6. Try clicking **Next** without any topics — verify it is disabled
7. Add one topic and click **Next**

**EXPECTED:**
- Pills appear and are removable ✓
- 5-topic cap enforced with error message ✓
- Suggestions disappear once added ✓
- Next requires at least 1 topic ✓

**IF IT FAILS:** Pills not appearing → check `addTopic()` in `OnboardingForm.tsx` is calling `setTopics`. Suggestions not hiding → the `.filter(s => !form.topics.includes(s))` condition is not matching; check for whitespace differences.

---

### Test 6.4 — Onboarding Step 3

**WHAT:** Test the Notion connection flow and form completion.

**HOW:**
1. Enter an **invalid** token (`secret_fake`) and any database ID
2. Click **Test connection** — verify red error message appears
3. Clear the token, enter your **real** token and real database ID
4. Click **Test connection** — verify green `✓ Connected successfully`
5. Verify **Complete setup** was disabled before the test and is now enabled
6. Click **Complete setup** — verify redirect to `/dashboard`

**EXPECTED:**
- Error message for invalid token: `"Invalid token — check your integration token"` ✓
- Complete setup disabled before successful test ✓
- Redirect to `/dashboard` after completion ✓
- Supabase `user_configs` row shows `notion_connected = true` ✓

**IF IT FAILS:** No redirect after Complete setup → `POST /api/users/config` is returning an error; check the network tab. Connection test always fails → check the test-notion route is running (test it in Section 5 first).

---

### Test 6.5 — Dashboard status card states

**WHAT:** Test every status card variant by manipulating the database.

**HOW:** For each state, insert or update a `pipeline_runs` row in Supabase and refresh `/dashboard`.

```sql
-- Get your user_id
SELECT id FROM users WHERE email = 'your-email@example.com';
-- (replace <user_id> in all queries below)

-- STATE: complete
INSERT INTO pipeline_runs (user_id, run_date, status, papers_fetched, papers_passed, top_score, notion_page_url)
VALUES ('<user_id>', CURRENT_DATE, 'complete', 87, 8, 8.5, 'https://notion.so/test-page-url')
ON CONFLICT DO NOTHING;
-- OR if row exists:
UPDATE pipeline_runs SET status = 'complete', papers_passed = 8, top_score = 8.5,
  notion_page_url = 'https://notion.so/test-page-url'
WHERE user_id = '<user_id>' AND run_date = CURRENT_DATE;

-- STATE: running
UPDATE pipeline_runs SET status = 'running', notion_page_url = null
WHERE user_id = '<user_id>' AND run_date = CURRENT_DATE;

-- STATE: empty
UPDATE pipeline_runs SET status = 'empty', papers_passed = 0
WHERE user_id = '<user_id>' AND run_date = CURRENT_DATE;

-- STATE: failed
UPDATE pipeline_runs SET status = 'failed',
  error_message = 'Notion API returned 401: Invalid token'
WHERE user_id = '<user_id>' AND run_date = CURRENT_DATE;

-- STATE: no run today (delete today's run)
DELETE FROM pipeline_runs
WHERE user_id = '<user_id>' AND run_date = CURRENT_DATE;
```

**EXPECTED per state:**
| State | Indicator colour | Key copy |
|---|---|---|
| `complete` | Green dot | "Today's digest is ready" + Notion button |
| `running` | Amber dot | "Digest is being generated…" |
| `empty` | Blue dot | "No papers matched today" |
| `failed` | Red dot | "Something went wrong" + error message |
| None | Grey dot | "Today's digest hasn't run yet" + Run now button |

**IF IT FAILS:** Wrong state shown → the `status` field is not being correctly passed from the API. Log the raw API response in `DashboardView.tsx:load()` to debug.

---

### Test 6.6 — Dashboard run history table

**WHAT:** Verify the run history table renders correctly with multiple rows.

**HOW:**
```sql
-- Insert 3 fake runs on different dates
INSERT INTO pipeline_runs (user_id, run_date, status, papers_fetched, papers_passed, top_score, notion_page_url)
VALUES
  ('<user_id>', CURRENT_DATE - 1, 'complete', 92, 7, 9.0, 'https://notion.so/page-1'),
  ('<user_id>', CURRENT_DATE - 2, 'empty', 45, 0, null, null),
  ('<user_id>', CURRENT_DATE - 3, 'failed', 88, 0, null, null);
```

Then visit `/dashboard` and check the Run history section.

**EXPECTED:**
- 3 rows (or more if you have existing runs) in date descending order
- Dates formatted as "Mon Apr 28" style
- Status pills: `complete` = green, `empty` = blue, `failed` = red
- `complete` row shows "View →" link, others show "—"

**IF IT FAILS:** Empty table despite rows in Supabase → `GET /api/users/runs` is not returning them; test with curl (Section 5.5).

---

### Test 6.7 — Settings page

**WHAT:** Verify settings load, save, and update correctly.

**HOW:**
1. Visit `http://localhost:3000/settings`
2. Verify all fields are pre-populated from the database (profile description, topics, experience level, digest hour)
3. Change topics: remove one, add a new one. Click **Save profile**
4. Verify green toast "Profile updated" appears and auto-dismisses
5. Change the digest hour to 8:00 AM. Click **Save delivery settings**
6. Verify toast appears. Hard-refresh the page. Verify digest hour is still 8:00 AM

**EXPECTED:** All saves trigger a toast. Values persist across page refresh.

**IF IT FAILS:** Toast not appearing → the `PATCH` returned an error; check network tab. Values not persisting → `PATCH` is succeeding but `GET` on reload is returning stale data; check the response from `GET /api/users/config`.

---

## Section 7: End to End Flow

---

### Test 7.1 — Full new user journey

**WHAT:** Complete end-to-end test from blank slate to Notion digest.

**WHY:** The only test that proves all layers work together with real credentials.

**HOW:**

**Step 1: Clear test data**
```sql
-- Remove only the manually-created test user (keep real users)
DELETE FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001';
-- Also clear today's papers_cache if you want to test a fresh fetch
DELETE FROM papers_cache WHERE fetch_date = CURRENT_DATE;
```

**Step 2–4: Sign up and onboard**
1. Open `http://localhost:3000` in incognito
2. Click **Get started free** → complete Clerk sign-up
3. Complete onboarding: write a real profile description, add 2–3 topics, connect your real Notion workspace

**Step 5–8: Run and check**
1. On the dashboard, verify the grey "hasn't run yet" card
2. Click **Run now**
3. Verify `pending` status card appears (may need one refresh)
4. In a terminal: `cd pipeline && python pipeline.py`
5. Wait for completion. Refresh `/dashboard`
6. Verify green "Today's digest is ready" card with paper count

**Step 9–10: Verify Notion**
1. Click **View in Notion**
2. Verify page title: `AI Digest — YYYY-MM-DD`
3. Verify paper count summary line at top
4. Open one toggle — verify Problem / Approach / Results / Builder Takeaway / Before Reading all populated
5. Verify "Read paper →" links to real arXiv PDF

**EXPECTED:** Notion page contains 3–12 papers with complete summaries. Page structure matches the spec.

**IF IT FAILS:** Work backwards through the layers: check `pipeline_runs` status in Supabase first, then the `error_message` column if status is `failed`.

---

### Test 7.2 — Second run same day

**WHAT:** Verify the duplicate run guard prevents double-publishing.

**HOW:** Immediately after Test 7.1 completes, click **Run now** on the dashboard.

**EXPECTED:** Error message: "Already ran today" — no second Notion page created, no new `pipeline_runs` row.

**IF IT FAILS:** Two `pipeline_runs` rows for today → the `maybeSingle()` check in the trigger route failed. Check `api/pipeline/trigger/route.ts`.

---

### Test 7.3 — Settings change affects next run

**WHAT:** Verify changing topics in settings changes what papers are scored on the next run.

**HOW:**
1. Go to Settings, change topics to something completely different (e.g. `["AI safety", "multimodal AI"]`)
2. Save profile
3. Move today's run to yesterday so "Run now" is available:
```sql
UPDATE pipeline_runs
SET run_date = CURRENT_DATE - 1
WHERE user_id = (SELECT id FROM users WHERE email = 'your-email@example.com')
  AND run_date = CURRENT_DATE;
```
4. Click **Run now** on the dashboard
5. Run `python pipeline.py` in terminal
6. Open the new Notion page — verify papers are skewed toward the new topics

**EXPECTED:** New Notion page has noticeably different papers than the first run. At least some papers in the `AI safety` or `multimodal AI` groups should appear.

**IF IT FAILS:** Same papers appear → the ranker is reading from a cached `user_config` that wasn't updated. Verify the Supabase `user_configs` row has the new topics before running the pipeline.

---

## Section 8: GitHub Actions

---

### Test 8.1 — Manual workflow trigger

**WHAT:** Trigger the daily pipeline from the GitHub Actions UI.

**WHY:** Confirms the workflow file is valid, secrets are set, and the production environment works.

**HOW:**
1. Push all changes to the `main` branch on GitHub
2. Go to your GitHub repository → **Actions** tab
3. Click **Daily Pipeline** in the left sidebar
4. Click **Run workflow** → select `main` branch → click the green **Run workflow** button
5. Click the running workflow to expand it and watch the logs in real time

**EXPECTED logs:**
```
Run pip install -r pipeline/requirements.txt
Successfully installed arxiv-... openai-... supabase-...

Run python pipeline.py
2024-01-15 05:00:xx  INFO  === Pipeline starting for 2024-01-15 ===
2024-01-15 05:00:xx  INFO  Fetched N papers for 2024-01-15
2024-01-15 05:00:xx  INFO  Processing N active user(s)
...
2024-01-15 05:00:xx  INFO  === Pipeline complete: N user(s) processed, N succeeded, 0 failed ===
```

Workflow status shows green ✓. Verify in Supabase that `pipeline_runs` rows were created/updated.

**IF IT FAILS:** **Secret not found** error → see Test 8.3. **Import errors** → check Python version (`3.11` in workflow matches your requirements). **Permission denied** on Supabase → service role key is wrong.

---

### Test 8.2 — Verify scheduled trigger is set

**WHAT:** Confirm the cron schedule is correctly configured.

**HOW:**
1. Go to your repository → **Actions** tab → **Daily Pipeline**
2. Look at the **Schedule** information in the workflow description, or go to the workflow YAML on GitHub and verify the `cron: "0 5 * * *"` line

To see the next scheduled run:
1. Go to **Actions → Daily Pipeline**
2. If at least one run has occurred, you will see **"Scheduled"** in the trigger column
3. GitHub does not show a countdown, but `0 5 * * *` means the next run is the next day at 05:00 UTC

**EXPECTED:** The workflow file shows `cron: "0 5 * * *"` and `workflow_dispatch` as triggers.

**IF IT FAILS:** If the cron never fires, verify GitHub Actions is enabled for the repository (**Settings → Actions → General → Allow all actions**).

---

### Test 8.3 — Secrets configured correctly

**WHAT:** Verify all three required secrets exist in the repository.

**HOW:**
1. Go to **GitHub → Repository → Settings → Secrets and variables → Actions**
2. Under **Repository secrets**, verify these three are present (values are hidden, only names are shown):
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

**EXPECTED:** All three names appear in the secrets list.

**IF IT FAILS (secret missing):** Click **New repository secret**, enter the name exactly as above (case-sensitive), and paste the value.

What the Actions log shows if a secret is missing:
```
KeyError: 'SUPABASE_URL'
```
or:
```
openai.AuthenticationError: Error code: 401 - Incorrect API key provided
```

---

### Test 8.4 — Workflow fails visibly on error

**WHAT:** Verify a broken secret causes a clear workflow failure rather than silent success.

**HOW:**
1. Go to **Secrets → OPENAI_API_KEY → Update**
2. Replace the value with `sk-invalid-key-for-testing`
3. Trigger the workflow manually (Test 8.1)
4. Observe the Actions log

**EXPECTED:** The workflow run turns **red** (failed). The log shows an `AuthenticationError` for the OpenAI call. The `pipeline_runs` row in Supabase has `status = 'failed'` with an error message.

After verifying, **restore the correct key immediately**:
1. **Secrets → OPENAI_API_KEY → Update** → paste the real key back

**IF IT FAILS:** If the workflow shows green despite the invalid key, the ranker's batch error handling is swallowing the error without propagating it upward. Check `ranker.py` — the per-batch `except Exception` should log and continue, but `pipeline.py` marks the run as `failed` when `deliver_to_notion` never gets called.

---

## Section 9: Edge Cases and Error Handling

---

### Test 9.1 — arXiv returns zero papers

**WHAT:** Verify the pipeline handles a day with no matching papers gracefully.

**HOW:**
```bash
cd pipeline
# Temporarily edit fetcher.py — change one group's query to something impossible
# E.g. change the first group's query to:
#   "query": 'abs:"xyzzy12345_impossible_string_that_will_never_match"'
python pipeline.py
# Restore the original query in fetcher.py
```

Or more safely, without editing code:
```sql
-- Delete today's cache to force a re-fetch
DELETE FROM papers_cache WHERE fetch_date = CURRENT_DATE;
```
Then temporarily add a nonsense keyword to one group in `fetcher.py`, run, and restore.

**EXPECTED:**
- Pipeline logs `Fetched 0 papers for ...`
- `pipeline_runs` row has `status = 'empty'`, `papers_fetched = 0`, `papers_passed = 0`
- No crash, no exception, no Notion page created
- Dashboard shows the blue "No papers matched today" card

**IF IT FAILS:** A crash on empty list means `rank_papers([])` or `deliver_to_notion([])` is not guarded. Both are checked in `ranker.py` (`if not papers: return []`) and `pipeline.py` (`if not scored: status = 'empty'`).

---

### Test 9.2 — Invalid Notion token at delivery time

**WHAT:** Verify one user failing does not prevent other users from receiving their digest.

**HOW:**
```sql
-- Set test user's token to invalid
UPDATE user_configs
SET notion_token = 'secret_invalid_token_broken'
WHERE user_id = (SELECT id FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001');
```

If you only have one active user, temporarily insert a second test user with valid credentials (repeat Test 2.3 with a different `clerk_id` and real Notion credentials).

```bash
python pipeline.py
```

```sql
-- Check both users' run statuses
SELECT u.email, pr.status, pr.error_message
FROM pipeline_runs pr
JOIN users u ON pr.user_id = u.id
WHERE pr.run_date = CURRENT_DATE;
```

**EXPECTED:**
- User with invalid token: `status = 'failed'`, `error_message` contains `"401"` or `"Invalid token"`
- User with valid token: `status = 'complete'`
- Console shows `[broken-user@example.com] Failed: ...` then continues to next user
- Final line: `1 succeeded, 1 failed`

**IF IT FAILS:** If the pipeline stops after the first user's failure, the `try/except` in `pipeline.py`'s per-user loop is not catching the error correctly. Verify the `except Exception as exc:` block followed by `continue` in `pipeline.py`.

Restore after:
```sql
UPDATE user_configs SET notion_token = 'secret_your_real_token'
WHERE user_id = (SELECT id FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001');
```

---

### Test 9.3 — OpenAI returns malformed JSON

**WHAT:** Verify the ranker handles a bad OpenAI response gracefully (code inspection).

**WHY:** `response_format: json_object` makes this rare but not impossible — the model can still return valid JSON with missing fields.

**HOW:** Read `pipeline/ranker.py` and verify:

1. The OpenAI call is inside a `try/except Exception` block ✓
2. On exception, the error is logged with `log.error(...)` ✓
3. The code `continues` to the next batch rather than raising ✓
4. Missing fields are handled via `.get("include")`, `.get("score", 0)` with defaults ✓

To simulate: temporarily edit `ranker.py` to `raise ValueError("simulated bad JSON")` at the top of the try block, run the pipeline, verify the user's run ends in `status = 'empty'` (not `'failed'`), and restore.

**EXPECTED:** Zero papers pass (the batch is skipped), but no exception reaches `pipeline.py`. The run completes as `empty` or `complete` with fewer papers, not `failed`.

---

### Test 9.4 — User with no topics set

**WHAT:** Verify the pipeline handles a user_config row with an empty topics array.

**HOW:**
```sql
UPDATE user_configs SET topics = '{}'
WHERE user_id = (SELECT id FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001');
```

```bash
python pipeline.py
```

**EXPECTED:**
- Pipeline does not crash
- Ranker uses `"general AI/ML"` as the topics string in the prompt (the fallback in `ranker.py`: `topics_str = ", ".join(topics) if topics else "general AI/ML"`)
- Some papers likely still pass and a Notion page is created

Restore:
```sql
UPDATE user_configs SET topics = ARRAY['RAG and retrieval', 'AI agents', 'LLM applications']
WHERE user_id = (SELECT id FROM users WHERE clerk_id = 'user_test_dev_clerk_id_001');
```

**IF IT FAILS:** A crash on empty array means `", ".join(topics)` received `None` instead of `[]`. Add a `or []` null guard in `ranker.py:_build_prompt`.

---

### Test 9.5 — Network timeout simulation

**WHAT:** Verify OpenAI timeout is handled and logged (code inspection + smoke test).

**HOW:** Verify `ranker.py` handles `openai.APITimeoutError`. The OpenAI Python client raises this automatically on network timeouts. The `except Exception as exc` block in `rank_papers` catches it.

To smoke-test, temporarily add a very short timeout:
```python
# In ranker.py, change the create() call temporarily:
response = client.chat.completions.create(
    ...,
    timeout=0.001,  # impossibly short
)
```
Run `python pipeline.py`. Verify the error is logged and the pipeline continues. Restore to default (no explicit timeout).

**EXPECTED:** Log line: `ERROR OpenAI scoring failed for batch starting at 0: ...`. Run ends as `empty` (no papers scored), not `failed`.

---

### Test 9.6 — Concurrent pipeline runs

**WHAT:** Verify the papers_cache deduplication is safe under concurrent access.

**HOW:** In two separate terminal windows:
```bash
# Terminal 1
cd pipeline && python pipeline.py &

# Terminal 2 (start immediately after)
cd pipeline && python pipeline.py &

# Wait for both to finish
wait
```

Check papers_cache:
```sql
SELECT fetch_date, COUNT(*) FROM papers_cache
WHERE fetch_date = CURRENT_DATE
GROUP BY fetch_date;
```

**EXPECTED:** Exactly the same number of rows as a single run. The `upsert` on `(arxiv_id, fetch_date)` is idempotent — a second concurrent upsert for the same paper silently does nothing.

The GitHub Actions `concurrency.cancel-in-progress: false` prevents this in production (second job waits for first to finish), but the database-level deduplication is the safety net if both somehow start.

**IF IT FAILS:** If you see double rows or unique constraint errors, the `upsert` in `fetcher.py` is not using `on_conflict="arxiv_id,fetch_date"`. Verify that argument is present.

---

## Section 10: Pre-Launch Checklist

Use this checklist as your final go/no-go gate before inviting any beta users.

---

### Infrastructure ready

- [ ] Supabase project created and `schema.sql` applied
- [ ] RLS enabled and verified on all 4 tables (Test 2.2)
- [ ] Supabase URL and all keys copied to `web/.env.local` and pipeline `.env`
- [ ] Clerk application created, webhook endpoint configured, signing secret set
- [ ] All env vars present and non-empty (Test 1.3)

---

### Auth working

- [ ] Dev server starts without Clerk errors (Test 1.7)
- [ ] Sign up creates a user in Clerk and in Supabase (Test 3.1, 3.2)
- [ ] Clerk webhook fires and returns 200 (Test 3.2)
- [ ] Login redirects to /dashboard (Test 3.3)
- [ ] Protected routes redirect to /login when logged out (Test 3.4)
- [ ] Sign out clears session and redirects to landing page (Test 3.5)

---

### Pipeline working

- [ ] All Python imports succeed (Test 1.1)
- [ ] Fetcher retrieves papers from arXiv and writes to papers_cache (Test 4.1)
- [ ] Ranker scores papers correctly and filters at threshold 7.0 (Test 4.2)
- [ ] Notion client creates page with correct structure (Test 4.3)
- [ ] Full pipeline runs end-to-end with a real test user (Test 4.4)
- [ ] Pipeline exits cleanly with no active users (Test 4.5)
- [ ] Cache deduplication prevents redundant arXiv calls (Test 4.6)

---

### Web app working

- [ ] Landing page renders on mobile and desktop (Test 6.1)
- [ ] Onboarding Step 1 validates profile description length (Test 6.2)
- [ ] Onboarding Step 2 enforces 5-topic limit (Test 6.3)
- [ ] Onboarding Step 3 test connection works with real Notion credentials (Test 6.4)
- [ ] All 5 dashboard status card states render correctly (Test 6.5)
- [ ] Run history table renders with correct colours and links (Test 6.6)
- [ ] Settings save and persist across page refresh (Test 6.7)
- [ ] All API routes return 401 without auth token (Test 5.7)

---

### End to end verified

- [ ] Full new user journey: sign up → onboard → run → Notion page (Test 7.1)
- [ ] Duplicate run guard prevents second run on same day (Test 7.2)
- [ ] Changing topics in settings affects next run's paper selection (Test 7.3)

---

### Error handling verified

- [ ] Zero papers returned: pipeline_run marked `empty`, no crash (Test 9.1)
- [ ] Invalid Notion token: run marked `failed`, other users unaffected (Test 9.2)
- [ ] OpenAI batch failure: logged and skipped, pipeline continues (Test 9.3)
- [ ] Empty topics array: ranker falls back gracefully (Test 9.4)
- [ ] Concurrent runs: papers_cache deduplication is idempotent (Test 9.6)

---

### GitHub Actions verified

- [ ] Manual workflow trigger succeeds and shows green (Test 8.1)
- [ ] `cron: "0 5 * * *"` schedule confirmed in workflow YAML (Test 8.2)
- [ ] All three secrets present in GitHub repository settings (Test 8.3)
- [ ] Invalid secret causes visible red failure in Actions UI (Test 8.4)

---

> **When all boxes are checked, you are ready to onboard your first beta user.**
