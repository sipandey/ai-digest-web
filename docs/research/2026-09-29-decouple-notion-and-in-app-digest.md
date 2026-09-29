---
date: "2026-09-29"
git_commit: "3755ea6ce4d6c35a869ee57daa6e55c55dcd7c31"
branch: "feature/spm-audit-roadmap"
repository: "AIDigestWeb"
topic: "Decouple Notion Gating and Elevate In-App Web Reader as Core Hub"
tags: "research, notion, web-reader, rpi, ux, spm"
status: "completed"
---

# Research: Decoupling Notion Gating and Elevating In-App Web Reader

## Research Question
Investigate why users encounter `Notion not connected — complete onboarding first` when clicking "Run now" or "Generate today's digest" on the web reader dashboard, analyze how Notion integration is coupled across the Next.js API and Python pipeline layers, and evaluate the product and architectural requirements to establish the in-app Web Reader as the primary consumption experience while preserving Notion as an optional destination channel.

## Summary
The investigation confirms that the web application already features a dedicated in-app Web Reader interface (`web/components/digest/DigestReader.tsx`), paper rating telemetry (`web/components/digest/PaperCard.tsx`), and a dedicated database store (`user_digests`). Furthermore, onboarding Step 3 explicitly informs users that Notion connection is "Optional" and can be skipped in favor of the web dashboard.

However, two legacy technical gates prevent users without Notion from generating or viewing digests:
1. **Next.js Trigger Route Gate (`web/app/api/pipeline/trigger/route.ts:195-200`):** The manual trigger endpoint explicitly checks `if (!notionConnected)` and responds with HTTP 400 (`Notion not connected — complete onboarding first`), blocking the run before dispatch.
2. **Python Pipeline User Filter Gate (`pipeline/config.py:48, 65`):** The pipeline user configuration queries filter with `.eq("notion_connected", True)`. Consequently, even if a run were queued for a user without Notion, `get_active_users()` would return an empty list and the pipeline would exit without producing papers.

In contrast, the actual pipeline processing code in `pipeline/pipeline.py:535-555` is already non-blocking: it stores the scored papers to `user_digests` unconditionally and treats Notion delivery as a conditional try/except block. Decoupling the trigger endpoint and `pipeline/config.py` unlocks immediate in-app digest generation for 100% of onboarded users.

---

## Detailed Findings

### 1. The UX Contradiction
When a user finishes onboarding without Notion:
- The onboarding screen states: *"Connect Notion to sync your digests automatically, or skip to view everything directly in your web dashboard."*
- The dashboard banner states: *"💡 Prefer reading in Notion? Connect your Notion workspace in Settings anytime."*
- The dashboard left pane states: *"No digest available for this date... Generate today's digest."*
- When clicking "Run now" or "Generate today's digest", the user receives a red validation error: `Notion not connected — complete onboarding first`.

This contradiction stems from the historical evolution of the codebase, which originated as an automated Notion bot before evolving into a multi-channel web reader.

### 2. Backend Gating Analysis (`web/app/api/pipeline/trigger/route.ts`)
- In lines 181–200, the route queries `user_configs(notion_connected, updated_at)`:
  ```typescript
  const configs = user.user_configs as { notion_connected: boolean; updated_at: string | null }[];
  const notionConnected = configs?.[0]?.notion_connected ?? false;
  const configUpdatedAt = configs?.[0]?.updated_at ?? null;

  if (!notionConnected) {
    return NextResponse.json(
      { error: "Notion not connected — complete onboarding first" },
      { status: 400 }
    );
  }
  ```
- **Finding:** The endpoint should only ensure that the user has an existing `user_configs` row (`!configs || configs.length === 0`). Requiring `notionConnected === true` is an obsolete constraint that breaks onboarding promises.

### 3. Pipeline Query Analysis (`pipeline/config.py`)
- In `pipeline/config.py`:
  - Lines 48: `.eq("notion_connected", True)` in single-user lookup `get_active_users(user_id)`.
  - Line 65: `.eq("notion_connected", True)` in paginated multi-user lookup `get_active_users()`.
- **Finding:** If `.eq("notion_connected", True)` is removed, `get_active_users` returns all active users with `active == True`. The downstream pipeline code in `pipeline.py`:
  - Always stores in-app digests via `_save_user_digest(user_id, run_date, lens, scored)` (line 536).
  - Only delivers to Notion if `user_config.get("notion_connected") and user_config.get("notion_token") and user_config.get("notion_database_id")` (lines 540-544).
  - Delivers to Webhook and Email if configured (lines 557-568).
  - Marks `pipeline_runs` as complete (lines 580-590).

### 4. Database & RLS Policy Status
- In `supabase/migrations/20260928_create_digests.sql` lines 34–40, the RLS policy for anonymous/service scheduling reads was already updated:
  ```sql
  DROP POLICY IF EXISTS user_configs_anon_scheduling_read ON user_configs;
  CREATE POLICY user_configs_anon_scheduling_read
    ON user_configs
    FOR SELECT
    TO anon
    USING (active = true);
  ```
- **Finding:** The database layer already supports active users without Notion credentials. No database migrations or schema alterations are needed.

### 5. Product & Strategy Assessment
- **Time-to-Value (TTV):** Removing Notion as a blocker reduces activation time from ~8 minutes (generating integration tokens, sharing databases, parsing IDs) to <30 seconds (sign in $\rightarrow$ pick topics $\rightarrow$ read digest).
- **Core Value Positioning:** The product's core value is AI-curated research synthesis across Builder, Founder, and Researcher lenses.
- **Surface Architecture:**
  - **Hub:** In-App Web Reader (rich formatting, paper feedback loop, interactive search/filter).
  - **Spokes (Export Channels):** Notion, Slack/Discord Webhooks, Daily Email Digest.
