---
title: "AI Digest Growth, Value, and Abuse-Resistance"
date: "2026-11-13"
research_doc: "docs/research/2026-11-13-growth-safety-product-research.md"
branch: "feature/product-growth-safety"
status: "in_progress"
phases_total: 3
phases_completed: 0
---

# AI Digest Growth, Value, and Abuse-Resistance Plan

**Goal:** Make first value clearer and faster, make past results usable, and enforce a bounded, understandable pilot experience across manual and scheduled work.  
**Audience decision:** Lead with AI builders; keep Builder, Founder, and Researcher lenses.  
**Usage assumption:** Database-backed hard ceiling of 50 pipeline attempts/day for the pilot; count every admitted attempt, including failures. Treat the cap as configurable in database settings.  
**Excluded:** Clerk production key/domain setup and triggering paid production runs. The user reports applying the budget migration before this deployment request.

## What We're NOT Doing

- Not changing Clerk credentials, OAuth providers, or production redirect settings.
- Not removing Founder/Researcher lenses or Notion/email/webhook destinations.
- Not introducing a paid plan or billing system without user-approved pricing.
- Not claiming the run ceiling is a dollar budget until provider usage/cost telemetry exists.
- Not attempting to reconstruct past paper payloads that were never persisted.

## Phase 1 — Safe pilot limits and operational truth

- [x] Add database-backed daily run-budget settings and an atomic attempt-claim function shared by Vercel and GitHub Actions. The user reports applying the migration to the target database.
- [x] Apply the claim to manual and scheduled work; limit repeated failed scheduled attempts; report quota exhaustion clearly.
- [x] Align per-user manual limits and displayed remaining usage.
- [x] Make pause state persistence fail visibly and exclude paused users from schedule discovery. Manual work remains available while scheduled delivery is paused.
- [x] Replace “Free forever”/unlimited plan claims with a truthful free-pilot/fair-use policy.

## Phase 2 — Faster first value, digest history, and score trust

- [x] Lead the landing page with builders and reconcile headline/sample counts.
- [x] Label the lens preview as a sample; remove stale timestamps, unsupported score/performance claims, and inaccurate delivery timing.
- [x] Make profile description optional and show a clear, accurate first-run path while retaining topics/lens personalization.
- [x] Make saved Recent Runs open their digest; expose only persisted rows as reader history and label legacy metadata-only entries.
- [x] Explain that the match score is personalized relevance, not scientific quality. A specific per-paper rationale remains a follow-up because the stored output has no grounded explanation field.

## Phase 3 — Measure durable value and user control

- [x] Add minimal first-party product events for activation and retention with an allowlist and no profile/paper content. No dashboard reporting or retention analysis is included yet.
- [x] Update privacy and terms language to match server-side digest storage, bookmarks, first-party product events, the OpenAI personalization data flow, and the free-pilot limit.
- [x] Add account data export and an in-app account deletion flow that uses Clerk's existing deletion lifecycle or deletes Notion-first app records; preserve existing Notion disconnect and schedule pause.
- [ ] Complete a device-level keyboard, screen-reader, and mobile review across onboarding, history, paper controls, and settings. The pause switch now exposes its state and history rows are keyboard-operable.

## Verification approach

No automated tests were run for this implementation. Review targets before release are migration/schema alignment, concurrent manual/scheduled budget claims, paused-user scheduling, persisted date navigation, event allowlist/content boundaries, export payload, deletion lifecycle, keyboard behavior, and narrow-screen layout. No production pipeline run is part of this work.

