# Session Log: decouple-notion-in-app-digest

**Date:** 2026-09-29 10:35
**Agent:** Siddharth Pandey
**Classification:** Feature

## Goal
Decouple Notion integration dependency from the manual trigger API and pipeline discovery, allowing users to run and view digests directly in the in-app Web Reader without connecting Notion, establishing the Web Reader as the primary product hub and Notion as an optional export channel.

## Files touched
- Created: docs/research/2026-09-29-decouple-notion-and-in-app-digest.md
- Created: docs/plans/2026-09-29-decouple-notion-and-in-app-digest.md
- Modified: web/app/api/pipeline/trigger/route.ts
- Modified: pipeline/config.py
- Created: web/lib/__tests__/trigger.test.ts
- Modified: pipeline/tests/test_config_pagination.py
- Modified: .agent-room/decisions.md

## Actions taken
1. Conducted research on the Notion coupling issue and documented findings in `docs/research/2026-09-29-decouple-notion-and-in-app-digest.md`.
2. Created 4-phase implementation plan in `docs/plans/2026-09-29-decouple-notion-and-in-app-digest.md`.
3. Updated `web/app/api/pipeline/trigger/route.ts` to remove the blocking `if (!notionConnected)` check and replace it with an onboarding completion validation check (`configs.length > 0`).
4. Updated `pipeline/config.py` `get_active_users()` to remove `.eq("notion_connected", True)` from both single-user and paginated multi-user queries, allowing all active users to be processed for in-app digests.
5. Added unit test suite in `web/lib/__tests__/trigger.test.ts` verifying that `POST /api/pipeline/trigger` succeeds for users without Notion connected and properly guards unauthenticated or un-onboarded requests.
6. Expanded `pipeline/tests/test_config_pagination.py` to verify users with `notion_connected=False` are retrieved by `get_active_users()`.
7. Recorded architecture decision in `.agent-room/decisions.md` and marked plan as completed.

## Tests run
- Command: npm run test:web
- Result: Pass (105 web Vitest tests passed across 7 suites)
- Command: npm run test:pipeline
- Result: Pass (200 pipeline pytest tests passed across 8 suites)
- Command: npm test
- Result: Pass (305 monorepo tests passed)
- Command: npm run validate
- Result: Pass
- Command: npm run eval
- Result: Pass (8/8 compliance evals passed)
- Command: npm run doctor
- Result: Pass

## Decisions made
- Architecture Decision: Decouple Notion gating to unlock In-App Web Reader as primary hub (see .agent-room/decisions.md)

## Outcome
**Status:** Completed
