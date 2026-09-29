---
title: "Streamline Settings Scope and Unified Intelligence Control Tower"
date: "2026-09-29"
research_doc: "docs/research/2026-09-29-settings-scope-and-streamlining-audit.md"
branch: "feature/spm-audit-roadmap"
status: "in-progress"
phases_total: 4
phases_completed: 1
---

# Plan: Streamline Settings Scope & Unified Intelligence Control Tower

**Goal:** Transform the fragmented, multi-save Settings page into a modern, unified "Intelligence Control Tower" organized across 4 strategic pillars (Intelligence, Schedule, Channels Hub, Account), featuring atomic unified saving, Notion disconnection, webhook verification, and AI feedback memory controls.

**Architecture:**
- **UI:** Refactor `web/components/SettingsView.tsx` with responsive layout (tabs/pills on desktop, smooth collapsible sections on mobile), unified dirty-state management with sticky save bar, quick-select topic chips, and unified Channels Hub.
- **API:** Extend `web/app/api/users/config/route.ts` to support Notion disconnection and digest pausing (`active`), add `POST /api/users/test-webhook` for immediate webhook validation, and add `POST /api/users/feedback/reset` for AI feedback memory reset.
- **Testing:** Add Vitest unit tests in `web/lib/__tests__/` covering webhook testing, Notion disconnect logic, and config updates.

---

## Phase 1: Backend API Extensions & Capabilities

### Overview
Enhance backend endpoints to support complete lifecycle management for channels, vacation mode, and feedback resets.

### Tasks
- [x] Update `web/app/api/users/config/route.ts` to support disconnecting Notion (`notion_connected = false`, nullifying tokens) and pausing digests (`active: boolean`).
- [x] Create `web/app/api/users/test-webhook/route.ts` to test Slack/Discord/generic webhooks with an immediate test payload.
- [x] Add `DELETE` or `POST /api/users/feedback/reset` (or query param) in `web/app/api/users/feedback/route.ts` to clear user feedback history.
- [x] Add Vitest tests validating these endpoint actions.

#### Automated Verification:
`npm run test:web`

---

## Phase 2: Unified Save UX & 4-Pillar Layout Refactor

### Overview
Eliminate the 4 disjointed save buttons. Implement a cohesive 4-pillar layout with dirty-state tracking and a single unified save bar.

### Tasks
- [ ] Restructure `web/components/SettingsView.tsx` into a responsive, 4-pillar navigation structure:
  1. **Intelligence** (Lens, Topics, Project Context, Experience Level)
  2. **Schedule** (Active toggle / Vacation mode, Delivery time, Timezone)
  3. **Channels Hub** (Web Dashboard, Daily Email, Slack/Discord Webhooks, Notion)
  4. **Account & Tier** (Profile, Plan tier, Sign out)
- [ ] Replace section-specific save handlers with a unified dirty-tracking state and floating/sticky save bar (`Save changes` / `Discard`).
- [ ] Widen desktop container to `max-w-3xl` with clean card grouping for comfortable desktop viewing.

#### Automated Verification:
`npm run test:web`

---

## Phase 3: Channels Hub Modernization & Verification Actions

### Overview
Elevate all export destinations into a unified, transparent Channels Hub with live testing and lifecycle controls.

### Tasks
- [ ] Integrate Notion into the Channels Hub with clear connection status and a 1-click **Disconnect Notion** action with confirmation.
- [ ] Add "Send Test Webhook" button for Slack and Discord channels with live success/failure feedback.
- [ ] Add quick-select topic chips in the Topics section (matching the onboarding experience).
- [ ] Add AI Feedback Memory card showing total rated papers and a "Reset AI Feedback" action.

#### Automated Verification:
`npm run test:web`

---

## Phase 4: End-to-End Verification & CAR Governance

### Overview
Run the complete verification pipeline, test all settings flows, and ensure CAR governance compliance.

### Tasks
- [ ] Run full test suite: `npm test` (Vitest + Pytest).
- [ ] Verify TypeScript build: `npm run build --prefix web`.
- [ ] Run CAR room validation: `npm run validate && npm run eval && npm run doctor`.

#### Automated Verification:
`npm test && npm run validate`
