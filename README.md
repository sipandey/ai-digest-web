# arXiv Digest Web

## What this is

arXiv Digest is a multi-tenant SaaS application that delivers a personalised daily summary of arXiv research papers directly to your Notion workspace. Each morning the pipeline scans every paper published in the last 24 hours across ML, NLP, CV, and AI, scores each one against your specific project description and experience level using GPT-4o-mini, and pushes a structured digest — with Problem, Approach, Results, and Builder Takeaway for every paper — into a Notion database you control.

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
│   │   ├── dashboard/page.tsx          Daily digest status + run history
│   │   ├── onboarding/page.tsx         Multi-step setup (profile → topics → Notion)
│   │   ├── settings/page.tsx           Edit profile, delivery settings, Notion
│   │   └── api/
│   │       ├── auth/webhook/       Clerk webhook — creates user rows on signup
│   │       ├── users/config/       GET + POST + PATCH user config
│   │       ├── users/runs/         GET last 7 pipeline runs
│   │       ├── users/test-notion/  Validate Notion credentials
│   │       └── pipeline/trigger/   Queue or retrigger a pipeline run
│   ├── components/
│   │   ├── OnboardingForm.tsx  Multi-step onboarding client component
│   │   ├── DashboardView.tsx   Dashboard client component
│   │   └── SettingsView.tsx    Settings client component
│   ├── lib/
│   │   └── supabase.ts         supabaseAdmin (service role) + createBrowserClient()
│   ├── proxy.ts                Clerk edge middleware — route protection
│   └── .env.local.example      Required environment variables for web
├── pipeline/                   Python pipeline
│   ├── config.py               Supabase client + get_active_users()
│   ├── fetcher.py              Shared arXiv fetch with papers_cache
│   ├── ranker.py               Two-pass GPT-4o-mini scoring + summarizing with cache
│   ├── notion_client.py        Per-user Notion page delivery
│   ├── pipeline.py             Orchestrator — runs all active users
│   └── requirements.txt        Python dependencies
├── supabase/
│   └── schema.sql              Full Postgres schema (5 tables) with RLS policies
├── .github/
│   └── workflows/
│       └── daily_pipeline.yml  Runs pipeline at 05:00 UTC daily
├── .env.example                All environment variables documented
└── README.md                   This file
```

## Setup instructions

### Supabase setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

### Clerk setup

1. Create a new application at [clerk.com](https://clerk.com)
2. Copy keys from **API Keys**:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
3. Go to **Webhooks → Add endpoint**:
   - URL: `https://your-domain.com/api/auth/webhook`
   - Subscribe to the `user.created` event
   - Copy the **Signing Secret** → `CLERK_WEBHOOK_SECRET`

### Local development

```bash
cd web
npm install
cp ../.env.example .env.local
# Fill in all values in .env.local
npm run dev
```

The app runs at `http://localhost:3000`.

### Running the pipeline locally

```bash
cd pipeline
pip install -r requirements.txt

# Create a .env file with:
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...
# OPENAI_API_KEY=...

python pipeline.py
```

The pipeline reads all active users from Supabase, fetches today's arXiv papers (cached after the first run), scores them per user, and pushes digests to each user's Notion workspace.

### GitHub Actions secrets

Add these three secrets in **GitHub → Repository → Settings → Secrets → Actions**:

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | OpenAI API key — shared across all users for GPT-4o-mini scoring |
| `SUPABASE_URL` | Supabase project URL — pipeline reads user configs and writes run results |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — bypasses RLS for pipeline operations |

Notion tokens and database IDs are stored per-user in Supabase and do **not** need to be GitHub secrets.

### Deploying

**Web app — Vercel:**
1. Connect the GitHub repository to a new Vercel project
2. Set the **Root Directory** to `web`
3. Add all variables from `web/.env.local.example` in **Project Settings → Environment Variables**
4. Deploy — Vercel auto-deploys on every push to `main`

For the in-app **Run now** button on Vercel, also set these server-side env vars:
- `PIPELINE_TRIGGER_MODE=github_actions`
- `PIPELINE_GITHUB_TOKEN` — GitHub token with permission to dispatch workflows
- `PIPELINE_GITHUB_REPOSITORY` — `owner/repo`
- `PIPELINE_GITHUB_WORKFLOW_ID=daily_pipeline.yml`
- `PIPELINE_GITHUB_REF=main`

**Pipeline — GitHub Actions:**  
The workflow at `.github/workflows/daily_pipeline.yml` runs automatically at 05:00 UTC every day. Enable Actions on the repository and add the three secrets above. You can also trigger it manually from the **Actions** tab.

### Local Run Now behavior

For local development, you can make the dashboard **Run now** button bypass GitHub Actions and spawn the Python pipeline directly from the Next.js app:

```bash
# web/.env.local
PIPELINE_TRIGGER_MODE=direct
OPENAI_API_KEY=your_openai_key
PIPELINE_PYTHON_BIN=python3
```

In direct mode, the route reuses your existing web Supabase env vars and launches `pipeline/pipeline.py` for the current user only, which is useful for debugging onboarding, fetching, ranking, and Notion delivery end to end.

## Adding your first user (manual beta)

Before the web signup flow is live, you can manually insert a user for beta testing:

1. Sign up through the web app at `/signup` — Clerk fires the `user.created` webhook which inserts the `users` and `user_configs` rows automatically.

2. If you need to insert manually (e.g. for testing the pipeline before the web app is deployed), run in Supabase SQL Editor:

```sql
-- Step 1: insert user
INSERT INTO users (clerk_id, email, name)
VALUES ('user_clerk_id_here', 'you@example.com', 'Your Name')
RETURNING id;

-- Step 2: insert config (use the id returned above)
INSERT INTO user_configs (
  user_id,
  notion_token,
  notion_database_id,
  notion_connected,
  topics,
  profile_description,
  experience_level
) VALUES (
  '<user_id from above>',
  'secret_your_notion_token',
  'your_32_char_database_id',
  true,
  ARRAY['RAG and retrieval', 'AI agents', 'LLM applications'],
  'I am building a RAG chatbot and want practical papers I can implement.',
  'developer_learning_ai'
);
```

3. Run `python pipeline/pipeline.py` — the user will appear in `get_active_users()` and receive their first digest.

---

## Deployment checklist

**Supabase**
- [ ] Project created
- [ ] `supabase/schema.sql` executed in SQL Editor
- [ ] RLS policies active (verify in Table Editor → RLS)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` copied to env

**Clerk**
- [ ] Application created
- [ ] Webhook endpoint configured pointing to `/api/auth/webhook`
- [ ] `user.created` event subscribed
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` copied to env

**GitHub secrets**
- [ ] `OPENAI_API_KEY` added
- [ ] `SUPABASE_URL` added
- [ ] `SUPABASE_SERVICE_ROLE_KEY` added

**Vercel**
- [ ] Repository connected, root directory set to `web/`
- [ ] All env vars from `web/.env.local.example` set in Vercel dashboard
- [ ] Deployment successful, domain accessible
- [ ] Custom domain configured (optional)

**Ready:** push to `main`, enable GitHub Actions, sign up as the first user.
