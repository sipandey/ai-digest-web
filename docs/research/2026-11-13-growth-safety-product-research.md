# Growth and Safety Product Research

**Date:** 2026-11-13  
**Input:** `docs/product-audit-and-backlog.md`, current code on `main`, and the signed-in production dashboard.  
**Requested scope:** Implement all audit recommendations except Clerk production-key/domain configuration.

## User decisions

- Lead positioning with **AI builders**; retain Founder and Researcher lenses.
- Use a **lower daily run ceiling** than the current 200/day default. Implementation assumption: 50 claimed pipeline attempts/day as an initial configurable pilot ceiling. This is an attempt ceiling, not a dollar-spend guarantee.
- Clerk production setup is explicitly excluded from this implementation.

## Current system map and findings

### Acquisition and first use

- `web/app/page.tsx` leads with all three personas and says “Free forever”; it also promises “300+” scanned and “5” actionable results while production showed 124 scanned and 10 results.
- `web/components/landing/InteractiveLensPreview.tsx` is a static RAPTOR example with a 9.1 score, “published yesterday”, unsupported performance statistics, and a stale delivery-time claim. These are illustrative but are not labelled as such.
- `web/components/OnboardingForm.tsx` has four steps. A 50-character project description and one topic are required before completion. Notion is already optional; schedule is selected during setup.

### Reader, history, and trust

- `web/components/digest/DigestReader.tsx` already has date-picker buttons backed by `digests`; `web/app/api/users/digests/route.ts` exposes up to 14 persisted digest dates.
- `web/components/dashboard/SidebarCards.tsx` renders Recent Runs as non-interactive status rows. A run can exist in `pipeline_runs` without a recoverable paper payload in `digests`.
- `PaperCard.tsx` already includes bookmark, copy, and More/Less feedback actions. Bookmarks use browser `localStorage`, so they do not follow the user to another device.
- The score is shown as `x/10` and marketing calls it calibrated, but the reader does not say it measures fit to the user’s interests rather than scientific quality.

### Scheduling, limits, and abuse resistance

- `SchedulePillar.tsx` already offers a vacation/pause toggle. It writes `users.active`; the scheduler filters active users in `pipeline/config.py`.
- `POST /api/users/config` currently treats failure to persist `users.active` as non-fatal and can echo the requested state. The UI may therefore show “paused” while the scheduler still sees the user as active.
- `get_active_digest_schedules()` in `supabase/schema.sql` returns active `user_configs` without joining `users.active`; paused accounts can still wake the lightweight hourly scheduler check even though the Python pipeline later filters them out.
- The web trigger route has a `SYSTEM_DAILY_RUN_BUDGET` default of 200, but only the manual route checks it, the read fails open, and it is not atomic with queueing. Scheduled work bypasses that route.
- `pipeline.py` can retry failed scheduled users in every subsequent hourly cumulative window because `_already_delivered_today()` only skips completed/empty rows. Repeated failures can consume repeated LLM work.
- `MAX_DAILY_TRIGGERS` is three in the server route, while the dashboard tells users the manual limit is one/day.

### Measurement and user control

- There is no product analytics dependency or product event table. Existing run history captures dates, counts, and outcomes, not first-digest reading or repeat engagement.
- `AccountPillar.tsx` has sign-out and plan copy, but no in-app data export or account deletion action. The auth webhook deletes database rows after Clerk deletion; privacy and terms pages have stale descriptions of data retention and the product's Notion-centric architecture.
- Existing Notion disconnect and schedule pause controls should be retained. Account deletion needs a deliberate confirmation flow and must remove linked data through the existing auth lifecycle.

## Design constraints

- Do not change Clerk key, production-domain, or Clerk dashboard settings.
- Enforce run budgets in the database transaction shared by Vercel and GitHub Actions; an environment-only cap can drift across those systems.
- A run attempt consumes budget once it is admitted, even if downstream work later fails. This avoids retries creating unbounded spend.
- Do not collect project descriptions, paper text, or profile text in product analytics. Keep the analytics event vocabulary allowlisted and update the privacy notice before instrumenting.
- The run cap is a volume ceiling. It is not a financial-dollar guarantee until per-run provider usage/cost is measured.
- Do not trigger paid production pipeline work or apply production migrations during local implementation.

