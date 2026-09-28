---
title: "SPM System Recovery and Unified Architecture Roadmap"
date: "2026-09-28"
research_doc: "docs/research/2026-09-28-spm-system-audit-and-unified-architecture.md"
branch: "feature/spm-audit-roadmap"
status: "planned"
phases_total: 4
phases_completed: 0
---

# SPM System Recovery and Unified Architecture Roadmap

**Goal:** Restore system availability by resolving database infrastructure failures, eliminate the bifurcated owner-versus-user pipeline, and deliver a generic, multi-persona AI research digest platform for all users.  
**Architecture:** Migrate from a hardcoded `MY_USER_ID` pipeline to a configurable `digest_lens` preference schema (`founder`, `builder`, `researcher`), deprecate fragile Notion-token guest authentication in favor of unified Clerk authentication with in-app Web Digest viewing, and establish automated multi-channel delivery.  
**Tech Stack:** Next.js 16 (App Router, TypeScript, React 19, Tailwind CSS v4), Python 3.11/3.13 (arXiv API, OpenAI GPT-4o-mini), Supabase (PostgreSQL, RLS), Upstash Redis, Clerk, Vitest, Pytest.

---

## Current State Analysis
As documented in `docs/research/2026-09-28-spm-system-audit-and-unified-architecture.md`:
1. The Supabase host `ugokwgzteaxmnabuaiie.supabase.co` is returning `NXDOMAIN`, preventing database connectivity for both web server routes and the Python pipeline.
2. The pipeline gates opportunity-scouting prompts, custom rubrics, and economics/finance arXiv categories to a single hardcoded UUID (`MY_USER_ID` in `pipeline/pipeline.py:393`).
3. Authentication is split between Clerk users and Notion-token guest sessions (`__digest_sid`), creating friction and security exposure.

### Key Discoveries:
- `pipeline/pipeline_config.py:426` contains high-value opportunity-scouting criteria (consumer pain, GTM moats, automation potential) that should be accessible to all startup founders and product managers.
- `web/lib/auth.ts:24-95` and `web/proxy.ts:25-50` maintain parallel authentication logic that can be unified.
- `package.json` contains full verification scripts: `npm test` runs both Vitest and Pytest suites in ~2.2s.

## Desired End State
- System online with unpaused/restored Supabase database and synchronized environment secrets.
- Any user can select their desired **Digest Lens** (*Founder / Opportunity Scout*, *Builder / Engineer*, *Deep Tech Researcher*) and subscribe to any arXiv category.
- Notion is an optional export destination; users can immediately read digests inside the web dashboard upon signup.
- Zero bifurcated code paths or hardcoded user IDs in production code.

## What We're NOT Doing
- We are NOT replacing Supabase with a different database provider.
- We are NOT replacing GPT-4o-mini with local LLMs in this phase.
- We are NOT removing Notion integration; we are making it optional rather than a prerequisite.

## Implementation Approach
Work is organized into four sequential phases: Bring-Up, Pipeline Unification, Web & Auth Consolidation, and Growth/Multi-Channel Distribution.

---

## Phase 1: Infrastructure Bring-Up & Stability Runbook

### Overview
Restore database infrastructure, apply required schema migrations, synchronize secrets across environments, and bring the local development server online.

### Tasks:
- [ ] Unpause or provision Supabase instance and verify DNS resolution.
- [ ] Apply pending SQL migrations (`guest_sessions.sql`, `anon_scheduling_read.sql`, `cleanup_guest_sessions_cron.sql`).
- [ ] Update environment variables in `.env`, `web/.env.local`, Vercel, and GitHub Secrets.
- [ ] Verify test suite and local web server startup.

#### Automated Verification:
`npm test`

---

## Phase 2: Unify Intelligence Pipeline (Democratize "Owner Mode")

### Overview
Eliminate hardcoded `MY_USER_ID` checks and transform opportunity-scouting prompts and extra arXiv categories into user-configurable settings.

### Tasks:
- [ ] Add `digest_lens` enum (`founder`, `builder`, `researcher`) to `user_configs` in Supabase schema.
- [ ] Refactor `pipeline/pipeline.py` to remove `MY_USER_ID` and apply lenses based on each user's stored preference.
- [ ] Refactor `pipeline/fetcher.py` and `pipeline/pipeline_config.py` to allow any user to select economics, finance, and statistics arXiv categories.
- [ ] Update `pipeline/notion_client.py` to format Notion blocks dynamically according to the user's active lens.
- [ ] Update Pytest unit tests in `pipeline/tests/` to validate multi-lens scoring.

#### Automated Verification:
`npm run test:pipeline`

---

## Phase 3: Unify Authentication & In-App Web Digest Reader

### Overview
Consolidate authentication onto Clerk, provide a migration path for existing guest users, and introduce a native Web Digest dashboard so users receive value without requiring Notion.

### Tasks:
- [ ] Create `digests` table in Supabase to store daily summarized papers per user in JSON format.
- [ ] Build in-app Web Digest reader component on `/dashboard` with paper cards, takeaway badges, and search.
- [ ] Deprecate Notion-token guest signup at `/setup` and standardize on Clerk OAuth/Email.
- [ ] Add 1-click Notion OAuth connection in `/settings` as an optional delivery destination.
- [ ] Simplify `web/lib/auth.ts` and `web/proxy.ts` by removing guest cookie branching.

#### Automated Verification:
`npm run test:web`

---

## Phase 4: Multi-Channel Growth & Personalization Feedback

### Overview
Expand delivery beyond Notion to email and team chat, and implement relevance feedback loops to personalize paper recommendations.

### Tasks:
- [ ] Implement daily HTML email digest delivery via Resend/Postmark.
- [ ] Add Slack/Discord incoming webhook integration for engineering team digests.
- [ ] Implement "More like this" / "Less like this" rating controls to refine per-user scoring vectors.
- [ ] Run full CAR CI verification and regression evals.

#### Automated Verification:
`npm run validate && npm run eval && npm run verify`
