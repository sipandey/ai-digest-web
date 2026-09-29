# Decisions Log — AIDigestWeb

Short, append-only record of architecture/design decisions and why. A
decision belongs here if a future session (or a future you) would otherwise
have to re-derive it from scratch by reading git history.

## Format

```
### YYYY-MM-DD — short title

**Decision:** what was decided.
**Why:** the constraint or trade-off that drove it.
**Rejected:** what else was considered, and why it lost.
```

<!-- Entries go below this line, newest first. -->

### 2026-09-29 — Decouple Notion gating to unlock In-App Web Reader as primary hub

**Decision:** Removed legacy `if (!notionConnected)` check in `/api/pipeline/trigger/route.ts` and removed `.eq("notion_connected", True)` from `get_active_users()` in `pipeline/config.py`. Manual triggers and scheduled runs now generate digests into the database (`user_digests`) for all onboarded users, delivering to Notion only if credentials are connected. Added unit tests for the trigger route (`web/lib/__tests__/trigger.test.ts`) and pipeline active users retrieval (`pipeline/tests/test_config_pagination.py`).
**Why:** Fixes the critical onboarding friction where users without Notion were blocked with `Notion not connected — complete onboarding first` when clicking "Run now", enabling immediate <30s time-to-value directly in the built-in Web Reader while preserving Notion as an optional export channel.
**Rejected:** Requiring a mock Notion token for web-only users; bifurcating trigger endpoints into web-only vs notion-connected.


### 2026-09-28 — Multi-channel growth and personalization feedback loop

**Decision:** Created `paper_feedback` table and `/api/users/feedback` endpoint enabling users to rate papers 👍 ("more like this") and 👎 ("less like this") directly on the in-app Web Reader. Incorporated user feedback categories into `ranker.py` and `pipeline.py` to boost relevant papers (+0.6) and penalize unwanted domains (-0.8). Extended `user_configs` and pipeline delivery with `webhook_client.py` (Slack Block Kit, Discord Embeds, generic webhooks) and `email_client.py` (responsive HTML email digest via Resend API), configurable in Settings.
**Why:** Unlocks user growth across team workspaces (Slack/Discord channels) and personal communication channels (email), and establishes a continuous reinforcement loop where every user interaction improves daily digest relevance.
**Rejected:** Static un-personalized scoring heuristics; relying solely on Notion as an integration channel; hardcoding email delivery without dry-run fallback.

### 2026-09-28 — In-app Web Digest reader and optional Notion destination

**Decision:** Created `digests` Supabase table and `/api/users/digests` endpoint storing daily evaluated papers JSON per user per run date. Built an interactive In-App Web Digest Reader on `/dashboard` with search, category filtering, collapsible technical breakdowns, and lens takeaway spotlight cards. Made Notion integration optional during onboarding and settings, allowing users without Notion to use the application immediately.
**Why:** Eliminates the forced drop-off during onboarding where users without a pre-configured Notion integration were locked out of the application.
**Rejected:** Retaining mandatory Notion database creation before dashboard access; reading digests exclusively via Notion API round-trips.

### 2026-09-28 — Multi-lens intelligence pipeline with cache namespace isolation

**Decision:** Implemented `digest_lens` enum (`builder`, `founder`, `researcher`) across Supabase schema, pipeline fetcher, ranker, and Notion delivery. Embedded the active lens into `_profile_hash` along with distinct prompt versions (`prompt_version_founder`, `prompt_version_researcher`). Updated Web API route and SettingsView / DashboardView UI to allow users to select their lens.
**Why:** Eliminates the hardcoded `MY_USER_ID` gating in `pipeline.py` while ensuring cached scores and summaries for one lens never collide with or overwrite evaluations generated under a different lens.
**Rejected:** Separate pipeline scripts per persona (code duplication) or storing multi-lens evaluations in unkeyed shared cache columns (risks cache corruption).

### 2026-09-28 — Strictly idempotent Supabase migrations and consolidated master schema

**Decision:** Formatted all Supabase SQL migration files with conditional guards (`DROP POLICY IF EXISTS`, conditional index drops that respect table constraints, `pg_cron` availability checks) and updated the canonical `supabase/schema.sql` to include all runtime table columns (`trigger_count`, `timezone_offset FLOAT8`, `guest_sessions`, anon read policies).
**Why:** Prevents duplicate policy/constraint crashes during fresh project spin-up or re-running migrations, avoiding divergence between initial schema definitions and delta migrations.
**Rejected:** Requiring manual step-by-step CLI execution or separate uncoordinated setup scripts.

### 2026-09-28 — Unify dual-path architecture via Digest Lenses and Web Digest reader

**Decision:** Adopted the Digest Lens framework (`founder`, `builder`, `researcher`) to generalize the hardcoded `owner_mode` across all users, and consolidated authentication onto Clerk with an in-app Web Digest reader, making Notion an optional export destination.
**Why:** Eliminates the hardcoded `MY_USER_ID` pipeline split and removes onboarding friction where users were required to configure Notion integrations before seeing value.
**Rejected:** Maintaining a dedicated admin/owner endpoint or keeping Notion as a mandatory prerequisite for all users.


### 2026-09-28 — Integrate create-agent-room v2.6.0 governance framework

**Decision:** Integrated create-agent-room v2.6.0 with standard profile, multi-tool rule sync across Claude, Cursor, Copilot, Windsurf, Cline, Codex, and full Git lifecycle hooks. Configured combined verification command (`npm test --prefix web && pytest pipeline/tests/ -q`) covering both Next.js/Vitest and Python/pytest suites. Added root package.json pinning create-agent-room@2.6.0 with convenience scripts.
**Why:** Establishes mechanical seatbelts (pre-commit guardrails, pre-stop test verification, anti-tamper, compliance evals) to ensure AI agents cannot break tests, leak credentials, or skip architectural decisions.
**Rejected:** Minimal preset without pre-stop test gate (too permissive for a dual-stack monorepo); running only web or only pipeline tests in verification (incomplete coverage).

