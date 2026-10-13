---
date: "2026-10-13T07:13:21Z"
git_commit: "8ec64220eb82e1a363e14d578731ddd5a9b2eddb"
branch: "feature/scheduled-web-digest-delivery"
repository: "AIDigestWeb"
topic: "Scheduled delivery eligibility for users without Notion"
tags: "research, scheduling, github-actions, web-reader, reliability"
status: "complete"
---

# Research: Scheduled delivery eligibility for web-only users

## Research Question

Trace the hourly GitHub Actions gate through database permissions and the Python pipeline to determine whether an active user without Notion receives a scheduled in-app digest. Identify the existing verification boundaries for a focused repair.

## Summary

The hourly workflow's `check` job requests only `user_configs` rows with `active=eq.true&notion_connected=eq.true` (`.github/workflows/daily_pipeline.yml:104-111`). If that query succeeds and the only due users have `notion_connected=false`, it returns no rows. The gate emits `users_due=0`, and the heavy pipeline job is skipped (`:142-153`). Manual dispatches bypass the gate (`:97-101`).

The database definition and pipeline already support scheduled web-only users: the earlier anon scheduling policy allowed all active config rows (`supabase/migrations/20260928_create_digests.sql:34-40`), and `get_active_users()` has no Notion filter (`pipeline/config.py:35-75`). The pipeline persists an in-app digest before optional Notion delivery (`pipeline/pipeline.py:546-563`). A later live check found that anon could also select `user_id` because the two-column grant did not remove an existing table-level grant. The current fix replaces direct table access with a restricted scheduling RPC.

## Detailed Findings

### 1. Hourly workflow and gate

- `.github/workflows/daily_pipeline.yml:38-41` schedules a run every UTC hour and offers manual dispatch.
- The check step uses the anon key and selects only `digest_hour,timezone_offset` (`:77-84`, `:108-111`). Its URL adds `active=eq.true&notion_connected=eq.true` (`:111`).
- jq computes a cumulative due count using the same half-away rounding as Python (`:119-142`). The pipeline job runs only when `users_due` is nonzero, `forced`, or `fallback` (`:147-153`).
- The code intends to set `users_due=fallback` when curl fails (`:113-117`). The current assignment is followed by a separate `$?` check. A local `bash -e -o pipefail` reproduction (`RESPONSE=$(false); if [[ $? -ne 0 ]]; then echo fallback; fi`) exits with status 1 before printing `fallback`. No existing test covers this check-step failure path.
- The query has no explicit pagination. This does not explain the web-only exclusion, but becomes relevant if the active user set exceeds PostgREST's response cap.

### 2. Database scheduling access

- `user_configs` has `notion_connected`, `active`, `digest_hour`, and `timezone_offset` columns (`supabase/schema.sql:52-78`).
- The earlier canonical schema granted anon SELECT on two scheduling columns and defined `user_configs_anon_scheduling_read` with `USING (active = true)`. Live verification showed this did not prevent direct `user_id` reads. The revised canonical schema and `20261013_anon_digest_schedules_rpc.sql` revoke direct anon SELECT and expose the active scheduling rows through `get_active_digest_schedules()`.
- The older migration `20250513_anon_scheduling_read.sql:26-31` used `active = true AND notion_connected = true`. The later `20260928_create_digests.sql:34-40` drops and recreates that policy with `active = true`. The current repository therefore depends on migration order for an existing deployment.
- The gate's RLS policy checks `user_configs.active`. The Python lookup also excludes rows whose parent `users.active` is false (`pipeline/config.py:46-72`). These eligibility checks are not identical.

### 3. Pipeline behavior after the gate

- `get_active_users()` filters on `user_configs.active` and parent `users.active`; it does not filter on `notion_connected` (`pipeline/config.py:35-75`).
- Scheduled runs apply `_is_user_due()` to each loaded user using the hour captured by the gate (`pipeline/pipeline.py:363-405`). A completed or empty run is skipped on later hourly runs that day (`pipeline/pipeline.py:139-159`, `:469-477`).
- The pipeline stores results for the in-app reader regardless of Notion connection. Notion, webhook, and email delivery are conditional (`pipeline/pipeline.py:546-580`).
- Existing Python tests cover hour conversion and cumulative timing (`pipeline/tests/test_pipeline_scheduling.py`) and loading active web-only users (`pipeline/tests/test_config_pagination.py`). No test executes the workflow's check step with a web-only due user.

### 4. Operational and documentation context

- `.github/workflows/ci.yml` runs pytest when `pipeline/**` changes; it does not include the daily workflow path in its path filters.
- `docs/testing-guide.md` still describes Notion as required for the full user journey and says a `Notion not connected` trigger error means onboarding is incomplete (`:991-1024`, `:1237-1280`). Those instructions predate the web-first decision in `.agent-room/decisions.md`.
- `.agent-room/guardrails.md` requires human review for CI/CD configuration changes and database migrations. The repository instructions require a branch from the latest `origin/main`, TDD for implementation, and Git identity `Siddharth Pandey <siddharth.pandey06@gmail.com>`.

## Key Design Patterns and Conventions

- Keep the hourly check cheap and read-only with the anon key; the service role key is reserved for the pipeline job.
- Use the same captured UTC hour in jq and Python to avoid startup clock drift.
- Use cumulative due windows, with `_already_delivered_today()` preventing repeat delivery.
- Keep the in-app digest as the primary persisted result and treat external channels as optional.

## Open Questions and Verification Limits

- Repository files establish the source mismatch. This research did not query the deployed database or GitHub Actions history, so it does not establish which RLS policy is currently deployed or whether curl is failing in production.
- The behavior of the query under the deployed anon grant should be verified with a read-only request before release. No production settings or data were changed during this research.
