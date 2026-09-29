---
title: "Home Screen and Dashboard Streamlining: Public Landing Modernization & Sticky Command Hub"
date: "2026-09-29"
research_doc: "docs/research/2026-09-29-home-screen-streamlining-and-ux-audit.md"
branch: "feature/spm-audit-roadmap"
status: "in-progress"
phases_total: 5
phases_completed: 1
---

# Plan: Home Screen & Dashboard Streamlining (Landing Page & In-App Web Reader)

**Goal:** Modernize both the Public Landing Screen (`/`) and the Authenticated Dashboard (`/dashboard`), eliminating legacy Notion-only messaging, resolving the "triple run button" CTA conflict, solving the two-column desktop dead-space with a Sticky Precision Command Strip, and introducing Paper Bookmarking, 1-click sharing, and interactive lens switching.

**Architecture:**
- **Public Home (`/`):** Update `web/app/page.tsx` with modern multi-channel positioning (In-App Web Reader, Email, Slack/Discord, Notion), interactive 3-persona synthesis lens preview widget, and session-aware navigation (`Welcome back → Go to Dashboard`).
- **Dashboard Hub (`/dashboard`):** Refactor `web/components/DashboardView.tsx` to eliminate code duplication, introduce a unified Value Realization Header, make the right sidebar a `sticky top-20` Precision Command Strip with triage progress tracking and paper jump-links.
- **Reader & Paper Ergonomics (`web/components/digest/`):** Enhance `PaperCard.tsx` and `DigestReader.tsx` with 1-click Bookmarking (persisted in local state/config), 1-click Copy Takeaway, score tier filtering (Must-Read 8.0+), and rating micro-confirmations.
- **Governance:** Keep each commit strictly under 500 lines changed per CAR rule. Run automated test suites at every phase.

---

## What We're NOT Doing
- We are NOT removing the Notion integration or channels — Notion remains an export spoke in the Channels Hub.
- We are NOT altering the core arXiv scoring algorithm in the Python pipeline in this UI phase.
- We are NOT creating a complex multi-table bookmark migration; bookmarks will be persisted in client storage with automated sync into user profile preferences.

---

## Phase 1: Architecture & Dashboard Component Deduplication

### Overview
Eliminate code duplication between `web/components/DashboardView.tsx` and `web/components/dashboard/SidebarCards.tsx`, unify shared types, and establish the bookmarking persistence layer.

### Tasks
- [x] Create `web/lib/bookmarks.ts` helper for persisting, toggling, and querying bookmarked papers (localStorage + fallback).
- [x] Refactor `web/components/dashboard/SidebarCards.tsx` to export enhanced, modular sidebar cards (`TodayStatusCard`, `RunHistoryCard`, `ConfigSummaryCard`).
- [x] Remove duplicate inline implementations of `TodayCard`, `RunHistory`, and `ConfigSummary` from `web/components/DashboardView.tsx` (saving ~250 duplicate lines).
- [x] Add unit tests in `web/lib/__tests__/bookmarks.test.ts` for bookmark persistence logic.

#### Automated Verification:
`npm run test:web`

---

## Phase 2: Paper Card Ergonomics, Bookmarking & Quick-Share

### Overview
Upgrade the core reading experience inside `web/components/digest/` to empower quick triage, deep reading, bookmarking, and team sharing.

### Tasks
- [x] Update `web/components/digest/PaperCard.tsx`:
  - Add 1-click **Bookmark / Star** toggle button with active styling.
  - Add 1-click **Copy Takeaway** button (copies formatted title, score, builder takeaway, and arXiv link to clipboard with visual toast).
  - Elevate the **Lens Takeaway Spotlight box** typography and visual hierarchy.
  - Add visual feedback micro-confirmation when clicking `👍 More` / `👎 Less`.
- [x] Update `web/components/digest/DigestReader.tsx`:
  - Add filter chip for **Saved / Bookmarked (⭐)** papers.
  - Add score filter for **Must-Read (8.0+)** papers.
  - Wire up bookmark state and count.
  - Add active search results counter ("Showing X of Y papers").

#### Automated Verification:
`npm run test:web`

---

## Phase 3: In-App Dashboard — Sticky Precision Command Strip & Value Proof Header

### Overview
Resolve the desktop layout imbalance where 85% of the right column is empty space, eliminate redundant run buttons, and provide mobile-first ergonomics.

### Tasks
- [ ] Resolve the "Triple Run Button" conflict:
  - Consolidate into a single, high-confidence Primary Action Header in `DashboardView.tsx` with live pipeline status and countdown.
  - Remove redundant trigger button from the sidebar card.
- [ ] Add **Value Realization Banner** in dashboard header:
  - Displays dynamic stats: *"Today's Briefing: X papers curated from Y arXiv papers scanned · Top score Z/10"*.
- [ ] Transform the desktop sidebar into a **Sticky Precision Command Strip** (`sticky top-20`):
  - **Triage Progress Ring**: Track and display reading progress ("X of Y papers reviewed").
  - **Paper Mini-Jump Outline**: Clickable paper titles for smooth 1-click scrolling to any paper in the feed.
  - **Relevance Tier Quick Toggles**: Fast access to 8.0+ must-reads.
- [ ] Optimize mobile ergonomics:
  - Compact header spacing so the first paper is visible above the fold on mobile viewports.
  - Smooth collapsible drawer for run history and setup on mobile screens.

#### Automated Verification:
`npm run test:web`

---

## Phase 4: Public Landing Page (`/`) Modernization & Session Awareness

### Overview
Bring the marketing front door into alignment with the modern multi-channel platform reality, eliminating outdated Notion-first messaging and recognizing returning users.

### Tasks
- [ ] Update hero copy and value proposition in `web/app/page.tsx`:
  - Emphasize native in-app Web Reader, daily email briefings, team chat webhooks, and optional Notion exports.
  - Remove deprecated "Return with Notion token" subtext.
- [ ] Add **Interactive Multi-Persona Lens Preview Widget**:
  - Replace static RAPTOR card with an interactive preview card allowing visitors to click between `Builder Lens`, `Founder Lens`, and `Researcher Lens` to experience synthesis adaptation before signup.
- [ ] Add **Smart Session Awareness**:
  - Check user session in `page.tsx` or client wrapper to display a personalized `Welcome back — Go to Dashboard →` banner for authenticated users.
- [ ] Modernize "How It Works", "What You Get", and FAQ sections to reflect multi-channel delivery.

#### Automated Verification:
`npm run test:web`

---

## Phase 5: Verification, Build & CAR Governance

### Overview
Ensure 100% test coverage pass rate, Next.js production build completion, and full CAR compliance.

### Tasks
- [ ] Run full test suite: `npm test` (Vitest + Pytest).
- [ ] Run Next.js production build: `npm run build --prefix web`.
- [ ] Verify live rendering on port 3100 via Chrome DevTools MCP (desktop and mobile viewports).
- [ ] Run CAR room governance: `npm run validate && npm run eval && npm run doctor`.

#### Automated Verification:
`npm test && npm run validate`
