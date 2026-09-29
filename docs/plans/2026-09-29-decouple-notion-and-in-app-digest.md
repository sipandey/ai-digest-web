---
date: "2026-09-29"
research_doc: "docs/research/2026-09-29-decouple-notion-and-in-app-digest.md"
branch: "feature/spm-audit-roadmap"
status: "completed"
phases_total: 4
phases_completed: 4
---

# Plan: Decouple Notion Dependency and Unlock In-App Web Reader for All Users

## Objective
Establish the in-app Web Reader as the primary consumption hub of AI Digest Web by removing obsolete Notion connection blockers in the Next.js API trigger and Python pipeline configuration, enabling immediate, frictionless digest generation for all onboarded users while keeping Notion as an optional export channel.

---

## Phased Execution Plan

### Phase 1: Decouple Trigger Route from Notion Check
- **File:** `web/app/api/pipeline/trigger/route.ts`
- **Changes:**
  - Update user configuration lookup from `user_configs(notion_connected, updated_at)` to `user_configs(id, updated_at)`.
  - Replace the `if (!notionConnected)` gate with a check ensuring onboarding completion (`if (!configs || configs.length === 0)`).
  - Return clear guidance if configuration is missing: `"Please complete onboarding first"`.
- **Verification:**
  - Build `web` and run unit tests.

### Phase 2: Decouple Pipeline User Discovery from Notion Requirement
- **File:** `pipeline/config.py`
- **Changes:**
  - In `get_active_users(user_id)`:
    - Remove `.eq("notion_connected", True)` from single-user query.
    - Remove `.eq("notion_connected", True)` from paginated multi-user query.
    - Keep `.eq("active", True)` so deactivated users remain excluded.
- **Verification:**
  - Run `pytest pipeline/tests/ -v`.

### Phase 3: Unit Testing & Regression Coverage
- **Files:**
  - `web/lib/__tests__/trigger.test.ts` (New test suite for `/api/pipeline/trigger`)
    - Test 401 when unauthenticated.
    - Test 400 when onboarding is incomplete (no config row).
    - Test successful trigger for users with `notion_connected: false`.
    - Test successful trigger for users with `notion_connected: true`.
  - `pipeline/tests/test_config_pagination.py`
    - Update and expand tests to verify active users with `notion_connected: False` are successfully returned by `get_active_users`.
- **Verification:**
  - `npm run test:web`
  - `npm run test:pipeline`
  - `npm test`

### Phase 4: CAR Governance, Documentation & Decision Logging
- **Files:**
  - `.agent-room/sessions/2026-09-29-10-35-decouple-notion-in-app-digest.md`
  - `.agent-room/decisions.md`
  - Update `docs/plans/2026-09-29-decouple-notion-and-in-app-digest.md` (`status: completed`, `phases_completed: 4`)
- **Verification:**
  - `npm run validate`
  - `npm run eval`
  - `npm run doctor`
