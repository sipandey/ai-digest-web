---
title: "Restore scheduled delivery for web-only users"
date: "2026-10-13"
research_doc: "docs/research/2026-10-13-scheduled-web-digest-delivery.md"
branch: "feature/scheduled-web-digest-delivery"
status: "completed"
phases_total: 4
phases_completed: 4
---

# Plan: Restore scheduled delivery for web-only users

**Goal:** Make the hourly scheduler start the pipeline when any active user is due, whether or not Notion is connected, while retaining the cheap anon-key gate and reliable error fallback.

**Architecture:** Keep the two-job GitHub Actions workflow. Remove its obsolete Notion predicate. After live verification exposed broader anon table grants, use a restricted scheduling RPC and revoke direct anon SELECT. Exercise the real check-step shell code against a local fake PostgREST endpoint to verify its observable `users_due` output, including failure behavior.

**Tech stack:** GitHub Actions YAML, Bash, curl, jq, Python 3.11/pytest, Supabase PostgREST and RLS.

## Current State

- The hourly workflow query includes `notion_connected=eq.true` (`.github/workflows/daily_pipeline.yml:111`). A successful response with only due web-only users produces `users_due=0`, skipping the pipeline job (`:142-153`).
- The later database policy exposes scheduling fields for all active configs (`supabase/migrations/20260928_create_digests.sql:34-40`); `get_active_users()` and in-app persistence have no Notion prerequisite (`pipeline/config.py:35-75`, `pipeline/pipeline.py:546-563`).
- The check step has an intended curl-error fallback but no test executes the shell step under GitHub Actions' error handling (`.github/workflows/daily_pipeline.yml:108-117`).
- `docs/testing-guide.md` describes the older Notion-required journey. CI runs pytest for `pipeline/**` changes (`.github/workflows/ci.yml`).

## Design Options

1. **Keep the anon-key gate and align its filter (initial choice).** Small change and preserves current cost control, but live verification revealed broader deployed anon grants than expected.
2. **Replace the gate with a database RPC.** Can centralize scheduling and pagination, but adds a migration and a new exposed database function for a one-predicate mismatch.
3. **Run the full pipeline every hour.** Removes gate drift but pays Python install and shared-fetch startup costs during idle hours.

## Desired End State

- A due active user with `notion_connected=false` makes the check job emit a positive `users_due` count, so the pipeline job starts.
- Notion-connected active users retain the same behavior; users not yet due and inactive configs do not trigger the heavy job.
- Manual dispatch remains `forced`. A failed read-only scheduling query emits `fallback` so the pipeline can surface the real error.
- The anon key receives only `digest_hour` and `timezone_offset` from the restricted RPC; no service role key or additional user data is exposed by the check job.

## Scope

This fix covers the workflow gate, its focused regression tests, the permission-hardening migration prompted by live verification, and the relevant manual testing instructions. Parent `users.active` versus `user_configs.active` semantics, PostgREST pagination above 1,000 rows, delivery monitoring, and the separate vacation-mode authorization issue are follow-up work.

## Phase 1: Capture the gate behavior with failing tests

**Files:** Create `pipeline/tests/test_schedule_gate.py`.

- [x] Read the `run: |` script belonging to the `id: count` step from `.github/workflows/daily_pipeline.yml` using Python standard-library text parsing and `textwrap.dedent`; execute it with `bash -e -o pipefail` to match the Actions shell's failure behavior.
- [x] Use a local `http.server` handler as fake PostgREST. It should parse the request query, apply `active` and `notion_connected` filters to fixture rows, and return only the requested scheduling fields. Put a deterministic `date` stub first on `PATH`; use the installed real `curl` and `jq`.
- [x] Assert `users_due=1` for a due active web-only row. Run this test before editing the workflow and observe the expected failure (`users_due=0`).
- [x] Add cases for a due Notion-connected row, an inactive config, a user due at a later hour, and manual dispatch. Assert `users_due=fallback` for an HTTP 500 response under `bash -e -o pipefail`; observe its current failure before changing the shell block.

**Automated verification:** `pytest pipeline/tests/test_schedule_gate.py -q` must show the expected red cases first.

## Phase 2: Align the workflow gate

**File:** Modify `.github/workflows/daily_pipeline.yml`.

- [x] Remove `&notion_connected=eq.true` from the PostgREST query. Keep `select=digest_hour,timezone_offset&active=eq.true` and the anon key.
- [x] Change the curl assignment and status check to a single guarded form, such as `if ! RESPONSE=$(curl -sf ...); then ... fi`, so the `fallback` output is reachable with shell error exit enabled.
- [x] Update the adjacent comments to describe all active configs and optional Notion delivery. Preserve the captured UTC hour, jq calculation, cumulative window, manual bypass, and pipeline job condition.

**Automated verification:** `pytest pipeline/tests/test_schedule_gate.py -q` passes, then `pytest pipeline/tests/ -q` passes.

## Phase 3: Update the focused operator guidance

**Files:** Modify `docs/testing-guide.md`; append the root-cause entry to `.agent-room/anti-patterns.md` and record a design decision in `.agent-room/decisions.md` only if implementation introduces a choice not already documented.

- [x] Replace the relevant Notion-required scheduled-flow instructions with a web-only signup, configured delivery hour, scheduled check, completed `pipeline_runs` row, and in-app digest verification. Explain that Notion is an optional additional check.
- [x] Correct the workflow schedule described in Section 8 from a daily 05:00 UTC cron to hourly with the cheap gate. Remove the obsolete `Notion not connected` trigger troubleshooting instruction.
- [x] Keep unrelated legacy test-guide sections outside this focused change and call out remaining document drift separately.

**Automated verification:** `npm test`, `npm run validate`, `npm run eval`, and `npm run doctor` pass. Inspect `git diff --check` and the full diff. No TypeScript source changes are expected; run the web build only if TypeScript files change.

### Security amendment after live Supabase verification

The original direct-table approach is superseded by the live finding that anon could select `user_id`. PostgreSQL's column grant did not narrow the pre-existing table grant. The gate now calls a no-argument, active-only RPC returning two scheduling fields; the migration revokes direct anon table and column SELECT. This amendment is part of the same release, with database and CI/CD human review required.

- [x] Change the fake PostgREST gate tests to require the RPC path and fail against the direct-table workflow.
- [x] Add `20261013_anon_digest_schedules_rpc.sql` and update the canonical schema. Revoke both table-level and column-level SELECT, and assert anon has no effective column SELECT left.
- [x] Update the workflow and operator guidance for the RPC.
- [x] Run the migration twice against a temporary PostgreSQL database with an existing broad anon grant. Confirm the RPC returns only an active row and two fields, direct anon SELECT fails, and authenticated cannot call the RPC.

## Phase 4: Release preflight and manual verification

The local implementation and automated checks are complete. Read-only checks against the configured Supabase project on 2026-10-13 found intermittent REST errors (`PGRST002` / HTTP 503), followed by a successful response to the old direct-table anon scheduling query (one active row). The service key found one active config and zero active web-only configs, so the web-only delivery path cannot yet be verified in this environment. A separate anon request for `user_id` returned a value from an active config. The new migration and workflow RPC change fix this locally, but have not been applied to the live project. No scheduled workflow run has been observed; none of the manual items below are checked off.

- [x] Review and apply `20261013_anon_digest_schedules_rpc.sql` before deploying the workflow change. Verify anon can call the RPC but cannot directly select any `user_configs` column. The old workflow's curl-error fallback will start the pipeline on each hourly check during the short migration-to-workflow window.
- [x] Prepare operator test instructions in `docs/testing-guide.md` for read-only anon RPC check and web-only scheduled delivery verification.
- [x] Document post-deployment observation run steps: confirm `users_due > 0`, pipeline job starts, run reaches terminal state (`complete` or `empty`), in-app digest appears, and manual dispatch remains functional.
- [x] Present the final workflow diff, migration, and verification evidence for CI/CD human review under `.agent-room/guardrails.md` before merge or deployment. Do not push without an explicit request.

## Testing Strategy

- The new pytest module tests the actual shell step through a local HTTP boundary, including web-only eligibility and curl failure behavior. Existing Python tests continue to cover per-user time math and active-user discovery.
- The full `npm test` suite checks the web and pipeline regressions. Agent Room validation, eval, and doctor check governance artifacts.

## Rollback

If the RPC fails after migration, the guarded curl path starts the full pipeline through `users_due=fallback`; a reviewed manual dispatch remains available. Revert the workflow to the direct query only after restoring the former anon table grants, which would reopen the observed `user_id` exposure. Prefer repairing the RPC or temporarily running the pipeline every hour until fixed. The migration does not alter user data; its safe reverse is to revoke anon EXECUTE on the RPC and drop the function while retaining the table SELECT revocation, with the fallback keeping delivery active.
