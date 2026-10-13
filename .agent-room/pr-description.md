# Pull Request Description

## Overview
* **Session Log Reference:** [2026-10-13-13-45-scheduled-web-digest-delivery.md](.agent-room/sessions/2026-10-13-13-45-scheduled-web-digest-delivery.md)
* **Date:** 2026-10-13 13:45
* **Agent:** Siddharth Pandey
* **Classification:** Feature

## Goal
Restore scheduled pipeline delivery for web-only users by updating GitHub Actions scheduling gate, securing Supabase anon access with a dedicated RPC, and ensuring complete regression coverage.

## Changes Implemented
- Created: docs/research/2026-10-13-scheduled-web-digest-delivery.md
- Created: docs/plans/2026-10-13-scheduled-web-digest-delivery.md
- Created: pipeline/tests/test_schedule_gate.py
- Created: supabase/migrations/20261013_anon_digest_schedules_rpc.sql
- Created: .agent-room/sessions/2026-10-13-13-45-scheduled-web-digest-delivery.md
- Modified: .github/workflows/daily_pipeline.yml
- Modified: supabase/schema.sql
- Modified: docs/testing-guide.md
- Modified: .agent-room/anti-patterns.md
- Modified: .agent-room/decisions.md

## Actions Taken
1. Conducted root cause research on why web-only users were skipped by hourly scheduled runs (Notion filter in GitHub Actions check step) and documented findings in `docs/research/2026-10-13-scheduled-web-digest-delivery.md`.
2. Created implementation plan in `docs/plans/2026-10-13-scheduled-web-digest-delivery.md`.
3. Created `pipeline/tests/test_schedule_gate.py` with mock PostgREST server to exercise the workflow's shell logic under `bash -e -o pipefail`. Verified red tests for web-only eligibility and error fallback.
4. Updated `.github/workflows/daily_pipeline.yml` to call `get_active_digest_schedules` RPC instead of querying `user_configs` directly, and guarded the curl invocation (`if ! RESPONSE=$(curl -sf ...); then`) so query failure emits `users_due=fallback` without prematurely exiting under errexit.
5. Implemented migration `supabase/migrations/20261013_anon_digest_schedules_rpc.sql` and updated canonical `supabase/schema.sql` to expose `get_active_digest_schedules()` security definer function, while revoking table and column SELECT privileges on `user_configs` from anon and public to prevent `user_id` leakage.
6. Updated operator manual testing instructions in `docs/testing-guide.md` to reflect web-only delivery and the hourly cron check with anon RPC gate.
7. Recorded root cause and anti-pattern lessons in `.agent-room/anti-patterns.md` and architecture decision in `.agent-room/decisions.md`.
8. Completed automated verification with `npm test`, `npm run validate`, `npm run eval`, and `npm run doctor`.

## Verification & Testing
- Command: pytest pipeline/tests/test_schedule_gate.py
- Result: Pass (6 gate tests passed)
- Command: npm run test:web
- Result: Pass (124 web Vitest tests passed across 10 suites)
- Command: npm run test:pipeline
- Result: Pass (206 pipeline Pytest tests passed across 9 suites)
- Command: npm test
- Result: Pass (330 tests passed: 124 Vitest + 206 Pytest)
- Command: npm run validate
- Result: Pass (Integrity checks passed)
- Command: npm run eval
- Result: Pass (8/8 compliance evals passed)
- Command: npm run doctor
- Result: Pass (CAR doctor checks passed)

## Decisions & Architecture Changes
- Restrict anonymous scheduling access through `get_active_digest_schedules()` RPC and revoke direct anon SELECT on `user_configs` (recorded in `.agent-room/decisions.md`).

## Outcome & Next Steps
* **Status:** **Status:** Completed
