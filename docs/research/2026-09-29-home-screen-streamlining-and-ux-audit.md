---
date: "2026-09-29"
git_commit: "eb2a343"
branch: "feature/spm-audit-roadmap"
repository: "AIDigestWeb"
topic: "Senior PM & UX Audit: Home Screen & Dashboard Streamlining"
tags: "home-screen, dashboard, ux, audit, spm, web-reader, triage, information-architecture"
status: "completed"
---

# Research: Home Screen & Dashboard Streamlining and Senior UX Audit

**Date:** 2026-09-29  
**Author:** Senior Product Manager & Senior UX Designer  
**Scope:** Public Landing Screen (`/`), In-App Dashboard & Web Reader (`/dashboard`), Navigation, Information Architecture, and Conversion Funnel.  
**Correlated Strategy:** `docs/plans/2026-09-28-spm-system-recovery-and-unified-roadmap.md` & `docs/research/2026-09-29-settings-scope-and-streamlining-audit.md`  
**Status:** Complete Research & Recommendations  

---

## 1. Executive Summary

Following the successful recovery of database infrastructure, pipeline lens unification, and the rollout of the 4-Pillar Settings Control Tower, the next critical frontier for AI Digest is the **Home Screen Experience**.

Today, "Home Screen" spans two interconnected surfaces:
1. **The Public Home / Landing Page (`/`)**: The conversion front door for prospective and returning users.
2. **The Authenticated Home / Dashboard (`/dashboard`)**: The primary daily engagement surface where users consume their personalized arXiv digest, trigger runs, and calibrate the recommendation engine.

### Core Strategic Verdict
The application has successfully transitioned from a **single-channel Notion bot** into a **multi-channel AI Research Intelligence Platform** featuring a native in-app Web Reader, daily email briefings, team chat webhooks, and optional Notion syncing. However, both the Public Home and the Authenticated Dashboard still suffer from **architectural debt, legacy copy, conflicting visual hierarchies, and ergonomic friction**.

By streamlining both surfaces into a unified, high-conviction product experience, AI Digest can dramatically lower Time to Value (TTV), elevate daily active engagement (DAU/MAU), and eliminate user confusion.

---

## 2. Competitive Landscape & Product Positioning

### How AI Digest Wins vs. Generic Aggregators

| Competitor / Alternative | Experience Model | Friction / Pain Point | AI Digest Advantage |
| :--- | :--- | :--- | :--- |
| **arXiv Direct / Daily Mailers** | Raw abstract dump | Information overload (300+ papers/day); no relevance scoring; academic jargon. | Personalized scoring (0–10) filtered to specific stack and experience level. |
| **Hacker News / Twitter (X)** | Social virality & hype | High noise-to-signal ratio; sensationalist claims; papers chosen by virality, not utility. | Noise-free, objective AI synthesis with structured Builder / Founder / Researcher takeaways. |
| **Semantic Scholar / Google Scholar** | Search & citation indexing | Passive retrieval — requires user to search; not optimized for daily morning scanning. | Active push & daily digest delivery; ready before your workday starts. |
| **Chatting with generic LLMs** | Prompt-driven ad-hoc Q&A | User must find paper URLs first; high friction; no automated daily corpus monitoring. | Automated 24h scanning across cs.AI, cs.CL, cs.LG, stat.ML, and finance/econ. |

### The Core Value Proposition
> **"Turn 300 daily arXiv papers into 5 actionable implementation takeaways before your morning coffee — in-app, via email, in Slack, or in Notion."**

---

## 3. Deep-Dive Audit: Surface 1 — Public Landing Page (`/`)

### Current State Assessment
- Built in `web/app/page.tsx` as a static marketing page.
- Visuals: Clean typography, good hero contrast with ambient indigo glow, responsive layout.

### Critical PM & UX Gaps

```
┌────────────────────────────────────────────────────────────────────────┐
│ Current Landing Page Flaws                                             │
├────────────────────────────────────────────────────────────────────────┤
│ ❌ Notion-Centric Legacy Messaging: Steps 1-3 & FAQ claim Notion is   │
│    mandatory ("The entire product is Notion-native", "Lands in Notion")│
│ ❌ Zero Visibility into In-App Web Reader: Users have no idea there   │
│    is a rich, interactive in-app dashboard with filters and search.    │
│ ❌ Session Amnesia: Logged-in users who land on / see "Sign In" and    │
│    "Get Started" with no "Go to Dashboard" button or auto-redirect.    │
│ ❌ Outdated Sample Digest: Static 2024 RAPTOR card; doesn't showcase  │
│    multi-persona lenses (Builder vs. Founder vs. Researcher).         │
│ ❌ Legacy Subtext: "Return with Notion token" link promotes deprecated │
│    guest token flow instead of standardized Clerk authentication.      │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Opportunities for Refinement
1. **Multi-Channel & In-App Showcase**:
   - Update headline subtext and feature grid to highlight: **"Read in-app, receive morning email briefings, stream to Slack/Discord, or export to Notion."**
   - Replace the static Notion card with an **interactive Web Reader interactive demo preview** featuring interactive Lens tabs (Builder, Founder, Researcher) allowing visitors to click and experience the synthesis difference before signing up.
2. **Session-Aware Navigation Header**:
   - If the user is authenticated (Clerk or guest session), dynamically render:
     `[Go to Dashboard →]` and personalized greeting instead of generic "Sign in / Get started".
3. **Deprecate Legacy Auth References**:
   - Remove "Return with Notion token" from the hero subtext; streamline all signups into Clerk with instant onboarding.

---

## 4. Deep-Dive Audit: Surface 2 — In-App Dashboard & Web Reader (`/dashboard`)

### Current State Assessment
- Page route: `web/app/dashboard/page.tsx` (server wrapper with `ErrorBoundary` and `getAuthUserId` check).
- Orchestrator: `web/components/DashboardView.tsx` (651 lines).
- Main child component: `web/components/digest/DigestReader.tsx` (373 lines).
- Paper item component: `web/components/digest/PaperCard.tsx` (224 lines).
- Sidebar cards: `web/components/dashboard/SidebarCards.tsx` (257 lines, currently duplicated inside `DashboardView.tsx`).

### Visual Hierarchy & User Journey Map

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Current Dashboard Layout (Desktop lg:grid-cols-3)                                     │
├─────────────────────────────────────────────────────────────┬─────────────────────────┤
│ Top Header: AI DIGEST · WEB READER | Good morning.          │ CTA: [⚡ Run now]       │
├─────────────────────────────────────────────────────────────┼─────────────────────────┤
│ Date History Bar: [Today 8★]                                │                         │
├─────────────────────────────────────────────────────────────┤ Sidebar (Card 1):       │
│ Reader Card:                                                │ Today's digest is ready │
│ ├── Subheader: [🛠️ Builder Lens] · Tue, Sep 29  [Notion ↗]   │ [Open in Notion]        │
│ ├── Search Input: Search papers by keyword...               │ [Run now] (Duplicate!)  │
│ ├── Category Pills: [All (15)] [cs.AI] [cs.CL] [cs.LG]      ├─────────────────────────┤
│ └── Paper Feed (Scrolls for 4,000+ px):                     │ Sidebar (Card 2):       │
│     ├── Paper #1: Title, Score 8/10, Category, PDF ↗        │ Run history             │
│     │   ├── Spotlight Box (Takeaway & Before Reading)       │ [Tue, Sep 29  Complete] │
│     │   └── Footer: [Technical breakdown ▼] [👍More] [👎Less]├─────────────────────────┤
│     ├── Paper #2: ...                                       │ Sidebar (Card 3):       │
│     │                                                       │ Your setup [Edit →]     │
│     │                                                       │ [Lens: Builder]         │
│     │                                                       │ [Topics: None set]      │
│     │                                                       ├─────────────────────────┤
│     └── Paper #15: ...                                      │ ⚠️ MASSIVE EMPTY SPACE  │
│                                                             │ (Nothing below card 3   │
│                                                             │ while feed scrolls      │
│                                                             │ for 3,500+ pixels!)     │
└─────────────────────────────────────────────────────────────┴─────────────────────────┘
```

---

## 5. Critical UX & Cognitive Friction Analysis

### Friction 1: The "Triple Run Button" & Conflicting CTAs
- **Problem**: There are currently up to **three** buttons to trigger a run on the same screen:
  1. Top-right header: `⚡ Run now`
  2. Sidebar `TodayCard`: `Run now` (next to `Open in Notion ↗`)
  3. Reader empty state: `Generate today's digest`
- **Cognitive Impact**: Creates confusion about whether they do different things (e.g. "Does the top button run everything, while the sidebar button only updates today?").
- **Solution**: Unify into a single, high-confidence Primary Action Header with real-time status.

### Friction 2: The Two-Column Desktop Dead-Space Problem
- **Problem**: In `DashboardView.tsx`, the layout is `lg:grid-cols-3` with `lg:col-span-2` for the feed and `col-span-1` for the sidebar. The 3 sidebar cards end after ~500px, leaving 85% of the right column empty while users scroll through 10–15 papers.
- **Solution**:
  - Transform the sidebar into a **Sticky Precision Command Strip** (`sticky top-20`).
  - Add high-value sticky utility widgets:
    - **Triage Progress Tracker**: "Reviewed 4 of 15 papers" with quick progress ring.
    - **Filter by Relevance Tier**: Quick toggles: `★ Top Picks (8.0+)`, `All Papers (15)`, `Saved/Bookmarked`.
    - **Paper Quick-Jump Mini-Outline**: 1-click jump to any paper in the feed.

### Friction 3: Missing Core Actions on Papers (Save & Share)
- **Problem**: If an engineer or founder reads a breakthrough paper, there is currently **no way to bookmark or save it** for later reference. Once tomorrow's digest arrives, the paper is buried in history.
- **Solution**:
  - Add a 1-click **Bookmark / Save to Library** button (persisted in local state / Supabase).
  - Add a 1-click **Copy Takeaway** button (copies formatted title, score, takeaway, and PDF link to clipboard for Slack/Notion).

### Friction 4: Passive vs. Active Intelligence (Lens Switching)
- **Problem**: The digest is rendered in whatever lens was selected in Settings (`builder`, `founder`, `researcher`). But users frequently wear multiple hats (e.g. an engineering founder wants the technical takeaway for architecture, but also the market opportunity for investors).
- **Solution**: Add an inline **Lens Perspective Switcher** right at the top of the Reader:
  `[🛠️ Builder (Default)]  [💡 Founder]  [🔬 Researcher]`
  Allowing users to instantly view how the synthesis frames the paper for different personas without leaving the dashboard!

### Friction 5: Mobile Stacking & Header Fatigue
- **Problem**: On screens `< 768px`, the greeting, subtitle, run button, date chip, and reader card header consume over 450px of vertical space before the user sees the first paper title. Furthermore, the sidebar cards are pushed to the very bottom below all 15 cards.
- **Solution**:
  - Compact mobile header: single-row greeting + icon action.
  - Floating action pill for triggering runs on mobile.
  - Collapsible/drawer access for setup and run history on mobile.

### Friction 6: Code Duplication in Dashboard Components
- **Architectural Debt**: `web/components/dashboard/SidebarCards.tsx` defines `TodayStatusCard`, `RunHistory`, and `ConfigSummary`. However, `web/components/DashboardView.tsx` reimplements internal copies (`TodayCard`, `RunHistory`, `ConfigSummary`) on lines 371–651, ignoring the dedicated file.
- **Solution**: Delete the duplicate implementations in `DashboardView.tsx` and import from `web/components/dashboard/SidebarCards.tsx` (mirroring the clean pattern established in Settings).

---

## 6. Senior PM & UX Strategic Recommendations

### Pillar 1: Public Home Screen (`/`) Modernization
1. **Reposition the Hero**:
   - Update value proposition from "synced to Notion" to "AI Research Intelligence Platform with in-app Web Reader, email briefings, Slack/Discord webhooks, and Notion sync".
2. **Interactive Live Synthesis Preview**:
   - Replace the static Notion screenshot with a live interactive widget showcasing the 3 lenses (Builder, Founder, Researcher) on a recent breakthrough paper (e.g. Qwen 2.5-Coder or DeepSeek R1).
3. **Smart Session Awareness**:
   - Detect active sessions in `page.tsx` and render a personalized "Welcome back, [Name] — Go to Dashboard →" hero CTA.

### Pillar 2: Authenticated Dashboard (`/dashboard`) Refinement
1. **Unified Header & Value Proof Bar**:
   - Clean, modern top bar:
     - Greeting: "Good morning, [Name]"
     - Value Counter: "Today's Briefing: 15 papers curated from 246 scanned · Top score 8.0★"
     - Primary Run Trigger: Single stateful button with progress spinner and countdown tooltip.
2. **Sticky Command Sidebar**:
   - Keep sidebar visible throughout the reading experience with:
     - Digest Triage Status (progress indicator: "3/15 viewed")
     - Score Filter Chips: `All (15)` | `Must Read (8.0+)` | `Bookmarked`
     - Quick Jump List (paper titles clickable for instant smooth scroll)
     - Clean Setup Summary with quick edit link
3. **Paper Card Ergonomics Upgrade**:
   - **Spotlight Takeaway**: Enhanced typographic hierarchy with crisp emoji badge and high-contrast callout.
   - **Bookmark / Star action**: 1-click save to local bookmarks collection.
   - **Copy Takeaway action**: 1-click formatted copy for Slack/Teams sharing.
   - **Feedback Tuning Confirmation**: Micro-toast feedback ("Preferences updated: prioritizing more LLM agent papers") when clicking 👍 More or 👎 Less.
4. **Codebase Modularization**:
   - Unify `SidebarCards.tsx` and remove redundant code in `DashboardView.tsx`.
   - Adhere strictly to the CAR < 500 lines per commit boundary during implementation.

---

## 7. Phased Implementation Roadmap Preview

| Phase | Focus Area | Deliverables | Target Lines |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Component Refactor & Deduplication** | Clean `DashboardView.tsx`, eliminate duplicate sidebar code, modularize subcomponents. | ~350 lines |
| **Phase 2** | **Paper Card Actionability & Bookmarks** | Add Bookmark/Save action, 1-click Copy Takeaway, feedback micro-confirmation. | ~300 lines |
| **Phase 3** | **Sticky Command Sidebar & Value Proof Bar** | Add triage progress tracker, score filters (Must-read 8.0+), sticky desktop layout. | ~350 lines |
| **Phase 4** | **Landing Page Modernization & Auth Redirect** | Update hero copy, add interactive lens preview, session-aware header. | ~280 lines |
| **Phase 5** | **Testing, Verification & CAR Governance** | Comprehensive Vitest/Pytest coverage, E2E visual verification, compliance audit. | ~150 lines |

---

## 8. Summary of PM Trade-Offs

- **Trade-off 1: Full Bookmark Database vs. LocalStorage / Supabase Bookmarks**:
  - *Recommendation*: Start with lightweight persisted bookmarks in local storage with optional backend sync in `user_configs.preferences`, avoiding complex schema migrations while delivering instant user value.
- **Trade-off 2: Sticky Sidebar vs. Full-Width Single Column**:
  - *Recommendation*: Retain the 2-column desktop layout but make the right column `sticky top-20` with interactive triage utilities. This solves the empty dead-space issue without compressing paper readability.
- **Trade-off 3: Automatic Redirect from `/` vs. Session-Aware Hero**:
  - *Recommendation*: Show a session-aware hero with a prominent "Continue to Dashboard →" button and quick dashboard link in the nav. This prevents confusing users who deliberately visit the marketing page to read FAQ or terms while logged in.
