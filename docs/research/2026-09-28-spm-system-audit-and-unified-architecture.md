---
date: "2026-09-28"
git_commit: "87f09b77995bb1a34e9ff6f291827bbfafe006d9"
branch: "feature/spm-audit-roadmap"
repository: "AIDigestWeb"
topic: "Senior Product Manager System Audit & Unified Architecture"
tags: "audit, architecture, spm, roadmap, rpi"
status: "completed"
---

# Research: Senior Product Manager System Audit & Unified Architecture

## Research Question
Audit why the application is currently down, map the technical dependencies required to bring it back up, deconstruct the dual-path architecture (owner/admin vs all users; Clerk vs Guest Notion-first auth), and design the foundation for a generic, user-friendly solution accessible to all users.

## Summary
The investigation identified two systemic root causes:
1. **Infrastructure Downtime:** The Supabase host `ugokwgzteaxmnabuaiie.supabase.co` is returning `NXDOMAIN` (project paused or deleted on Supabase), causing fatal connection errors across Next.js API routes and the Python pipeline.
2. **Dual-Path Architecture:** The codebase is bifurcated in two independent layers:
   - **Pipeline Layer:** Hardcoded `MY_USER_ID` activates `owner_mode` in `pipeline/pipeline.py` and `pipeline/ranker.py`, reserving opportunity-scouting prompts and extra arXiv categories exclusively for the owner.
   - **Authentication/Web Layer:** Two divergent onboarding and session stacks exist: standard Clerk OAuth/Email vs Guest Notion-first session cookies (`__digest_sid`) backed by `guest_sessions`.

---

## Detailed Findings

### 1. Root Cause of Current Downtime
- **Supabase DNS Failure:**
  `nslookup ugokwgzteaxmnabuaiie.supabase.co` returns `NXDOMAIN`.
  Because both `.env` (`SUPABASE_URL`) and `web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`) point to this paused/deleted project, every server-side route using `supabaseAdmin` (`web/lib/supabase.ts:8`) fails.
- **Pipeline Crash:**
  Running `pipeline/pipeline.py` fails at `fetch_papers()` (`fetcher.py:107`) with `httpcore.ConnectError: [Errno 8] nodename nor servname provided, or not known`.
- **Next.js Web Status:**
  No active processes are listening on port 3000/3001. Next.js 16 compiles and builds cleanly (19/19 routes), but fails at runtime on any database-backed route.

### 2. Deconstruction of the "Two Paths" Anti-Pattern

#### Bifurcation A: Pipeline & Intelligence (`owner_mode` vs standard users)
- **Files:** `pipeline/pipeline.py`, `pipeline/pipeline_config.py`, `pipeline/ranker.py`, `pipeline/fetcher.py`, `pipeline/notion_client.py`
- **Owner-Only Gating:**
  - In `pipeline/pipeline.py:393`: `owner_mode = bool(my_user_id and user_id == my_user_id)`.
  - In `pipeline/fetcher.py:262`: Extra arXiv categories (`econ.EM`, `q-fin.EC`, `stat.AP`) are fetched only if the owner is in the run.
  - In `pipeline/pipeline_config.py:426`: `SCORING_CRITERIA_OWNER` evaluates:
    1. *Consumer / SMB Pain*
    2. *Distribution / GTM Advantage*
    3. *Automation / Replacement*
    4. *Non-Technical Viability*
    5. *Defensibility / Moats*
  - In `pipeline/pipeline_config.py:612` & `649`: Custom prompts (`SCORE_PROMPT_TEMPLATE_OWNER`, `SUMMARY_PROMPT_TEMPLATE_OWNER`) generate structured opportunity callouts instead of academic summaries.
  - In `pipeline/notion_client.py:96`: Notion blocks render opportunity labels (`Consumer / SMB Pain`, `GTM / Distribution Angle`, `Automation Opportunity`) instead of standard blocks.
- **Standard Users:** Receive only Computer Science categories and a traditional paper breakdown (*Problem, Approach, Results, Builder Takeaway, Learning Path*).

#### Bifurcation B: Authentication & Onboarding (Clerk vs Guest Notion-first)
- **Files:** `web/proxy.ts`, `web/lib/auth.ts`, `web/lib/session.ts`, `web/lib/guest-sessions.ts`, `web/app/api/guest/setup/route.ts`, `web/app/api/guest/verify/route.ts`
- **Clerk Flow:** Users sign up with Email/OAuth -> redirected to `/onboarding` -> multi-step configuration.
- **Guest Flow:** Users bypass email entirely, entering a Notion integration token at `/setup`. The system creates a user with `clerk_id = "guest_..."`, sets a 30-day HMAC-SHA256 cookie (`__digest_sid`), and records a UUID in `guest_sessions`.
- **System Friction:**
  - Route middleware in `web/proxy.ts` must maintain two authentication paths.
  - `web/lib/auth.ts` branches on Clerk JWT vs `__digest_sid`.
  - Abuse risk: No verified email is required for guest setups, allowing unbounded Notion token account creation (documented in `BACKLOG.md` item M-7).

---

## Code References
- `pipeline/pipeline.py:393` — Hardcoded `owner_mode` evaluation.
- `pipeline/pipeline_config.py:426` — `SCORING_CRITERIA_OWNER` rubric.
- `pipeline/ranker.py:368` — Branching between standard and owner prompt templates.
- `pipeline/fetcher.py:262` — Conditional fetching of extra economics/finance arXiv categories.
- `web/lib/auth.ts:24-95` — Divergent Clerk vs Guest session resolution.
- `web/proxy.ts:25-50` — Edge middleware route matching for both authentication paradigms.
- `web/lib/supabase.ts:8` — Service-role Supabase client targeting paused host.

---

## Key Design Patterns & Conventions Discovered
- **Testing:** Comprehensive test suite in `web/lib/__tests__/` (Vitest) and `pipeline/tests/` (Pytest).
- **Security:** Application-layer AES-256-GCM encryption for Notion tokens via Web Crypto (`web/lib/encryption.ts`) and Python `cryptography` (`pipeline/encryption.py`).
- **Governance:** `create-agent-room` v2.6.0 installed with standard preset and git hooks.

---

## Open Questions & Strategic Recommendations
1. **Product Recommendation:** Refactor `owner_mode` into a first-class user preference ("Digest Lens": *Founder / Opportunity Scout*, *Builder / Engineer*, *Deep Tech Researcher*) available to all users.
2. **Onboarding Recommendation:** Phase out Notion-token guest auth in favor of standard Clerk authentication with an in-app Web Digest reader, making Notion an optional export destination rather than a prerequisite.
