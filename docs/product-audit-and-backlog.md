# AI Digest Product Audit and Story Backlog

**Audited:** 2026-11-13  
**Scope:** Public landing page, Clerk sign-in/onboarding, digest dashboard and history, settings, pipeline trigger controls, and scheduled pipeline safeguards.  
**Evidence:** Current repository implementation and the signed-in production dashboard. This is a code-and-product review, not a conversion or cohort analysis; analytics data and user interviews were not available.
**Product decisions:** Lead with AI builders, keep Founder/Researcher lenses, and start the free pilot with a database-configurable 50-attempt/day shared ceiling and one manual attempt/user/day. This is a volume control, not a dollar-cost guarantee.
**Implementation status:** Non-Clerk work is underway on `feature/product-growth-safety`; the user reports applying the budget migration, while application code has not yet been deployed. Clerk production key/domain setup is explicitly excluded by the user.

## Product assessment

AI Digest has a clear useful core: it turns new arXiv papers into role-specific summaries, and users can read in the app without connecting Notion. The three lenses, topic preferences, search, filters, saved papers, feedback controls, and optional delivery channels give the product a solid base.

The product is **promising for an individual beta, but not ready for broad acquisition yet**. The highest risks are the sustainability of “free forever” daily generation, production auth configuration, and the gap between a run being reported complete and its reader content being available. The UX also makes it harder than necessary to reach and revisit value: onboarding asks for a detailed profile before a user sees results, and Recent Runs show status without opening the saved digest.

| Area | Assessment | Why |
| --- | --- | --- |
| Core value | Strong | Personalized research triage with practical, role-specific takeaways is concrete and differentiated from generic paper lists. |
| Positioning | Mixed | Landing page speaks to builders, founders, and researchers at once. “300+ to 5” conflicts with the live dashboard’s 124 scanned and 10 selected. |
| First-use experience | Needs work | Four-step onboarding requires a 50-character profile and a topic before the user reaches the reader. Notion is correctly optional. |
| Reading experience | Good foundation | Search, filters, save, feedback, quick-jump outline, and multi-lens preview are already present. |
| Retention/history | Incomplete | The date picker reads persisted digests, but Recent Runs is status-only. Legacy run rows can exist without reader payloads. |
| Trust | Needs work | A 0–10 score and “breakthrough” claims lack an in-product explanation of why a paper matched or how to interpret the score. |
| Abuse and unit economics | Not scale-ready | UI says one manual run/day while the server allows three. The global run budget is not a hard ceiling for scheduled runs and the check fails open on DB errors. |
| Production readiness | Needs work | Production browser logs showed Clerk warning that development keys are being used in production. |

## Audit findings and recommendations

### Evidence trail

- Landing-page audience, “300+ to 5,” “free forever,” and scoring claims: `web/app/page.tsx`.
- Four-step onboarding and required profile/topic fields: `web/components/OnboardingForm.tsx`.
- Client display says “Manual limit: 1/day”: `web/components/DashboardView.tsx`.
- Server allows up to three manual triggers; the system budget check is in the manual route: `web/app/api/pipeline/trigger/route.ts`.
- Hourly scheduler filters active users by configured schedule and launches the pipeline independently of the manual route: `.github/workflows/daily_pipeline.yml`, `pipeline/pipeline.py`.
- Digest history picker: `web/components/digest/DigestReader.tsx`; Recent Runs status rows: `web/components/dashboard/SidebarCards.tsx`.
- Production Clerk development-key warning: observed in the production browser console during the Nov 13 smoke test.

### 1. Make the service sustainable before inviting growth

The marketing page promises “Free forever,” while scheduled runs can process every active user. The manual trigger endpoint has a nominal system budget, but scheduled jobs bypass that endpoint, the budget read is not atomic, and a budget-query error continues through. The client’s “Manual limit: 1/day” also differs from the server’s `MAX_DAILY_TRIGGERS = 3`. These are verified implementation mismatches, not hypothetical product risks.

**Recommendation:** Use the agreed free-pilot policy: a 50-attempt/day shared ceiling plus one manual attempt per account per UTC day; apply the same atomic, fail-closed quota claim to scheduled and manual work. This is a run-volume ceiling, not a spend guarantee. Add cost telemetry before calling it a dollar budget. Do not use account signup as the only cost-control boundary.

### 2. Fix production identity configuration before acquisition

The live production browser emitted a Clerk warning about development keys. A user can currently see a rendered dashboard, but development keys are not a dependable production sign-in foundation at larger scale.

**Recommendation:** Configure production Clerk keys, authorized domains and redirect URLs; verify the complete Google sign-in and sign-out path with production credentials; add a deployment check that rejects development credentials in production. **Deferred by user:** production Clerk setup remains out of scope for this implementation.

### 3. Make prior results a first-class navigation path

The `/api/users/digests` endpoint and date picker support opening persisted digest rows. The separate Recent Runs card only renders a date, counts, and status; its entries are not clickable. The production dashboard showed a Nov 12 run summary while the digest picker had only Today. Earlier runs had run metadata but no paper payloads, so those historical papers cannot be reconstructed.

**Recommendation:** Make each successful run open its saved digest from both the picker and Recent Runs. Distinguish “run completed, no reader payload” for legacy entries from a saved digest, and never imply that a summary row contains the papers. Preserve old data only where payloads actually exist.

### 4. Reduce time to first value and choose a clearer audience wedge

The landing page targets technical decision-makers broadly, while onboarding makes users describe a project in at least 50 characters, select topics and experience, choose a lens, and set a schedule. A user should understand the result before investing that effort.

**Recommendation:** Lead with one initial segment and its job-to-be-done; retain the other lenses as secondary options. Let a new user preview a representative digest, start with sensible defaults, and refine their profile after seeing the first result. Keep Notion optional and show exactly when the first digest will be ready or allow a controlled first-run generation.

### 5. Improve trust in AI selection and summary quality

The app describes a calibrated 0–10 match score and highlights “Must-Read” papers, but the reader does not explain score meaning or show the specific profile/topic match behind a recommendation. The marketing sample count and live count also differ.

**Recommendation:** Explain score bands in plain language, show a short “matched because…” rationale tied to a user’s topics/profile, and distinguish relevance from paper quality. Align claims and counts with actual product behavior; include a representative sample with date and lens.

### 6. Measure activation and protect user control

Search, save, feedback, schedule, and delivery settings exist, but the reviewed surfaces do not establish whether onboarding is completed, a paper is read/saved, or a user returns. Growth choices without these signals would be guesswork.

**Recommendation:** Define activation as “first digest opened and at least one paper saved, expanded, or rated” (validate this definition with users). Measure signup-to-first-digest time, first-week return, useful-paper rate, empty/failed runs, and cost per active user. Add clear pause-schedule and account/data controls before expanding scheduled delivery.

## Implementation notes

- Added a Supabase migration for a shared atomic attempt budget, scheduled/manual claims, a 50-attempt default, a one-manual-attempt default, and allowlisted first-party product events. Attempt outcomes are recorded without raw error text. The user reports applying the migration before deployment.
- Manual and scheduled runs now claim budget before user-specific model work. Failed attempts consume a claim; a scheduled user can only claim once per UTC date. Budget lookup failures stop work.
- The existing pause toggle now reports persistence failures, and scheduler discovery excludes paused accounts. On-demand runs remain available while paused.
- Landing copy is builder-first, the demo is labeled illustrative, old volume/free-forever claims are removed, and the onboarding project description is optional.
- Recent Runs now opens persisted digests and marks metadata-only historical runs as unavailable. Date selection is reflected in the URL.
- First-party events record only allowlisted event names. Export includes account/preferences, feedback, saved digests, run history, and browser-local bookmarks from the exporting device. Account deletion uses Clerk's existing deletion lifecycle or deletes Notion-first app records.
- OpenAI receives the configured profile context and topics as part of personalized scoring; the privacy copy now discloses this. A specific “matched because” explanation is not fabricated because the scoring output currently contains no grounded per-paper rationale.
- A keyboard-operable pause state and history links were added; full mobile and assistive-technology review remains open. Do not treat the local change as launch-ready until the migration and release review are complete.

## Prioritized story backlog

Stories are ordered by risk reduction and time-to-value. “Size” is a relative first-pass estimate; confirm after discovery. Acceptance criteria are intended to make each story independently testable.

### P0 — Establish safe growth foundations

#### AD-01 — Enforce a single usage and spend policy

**As the product owner,** I want scheduled and manual digest work to obey the same transparent usage policy so growth cannot create unbounded model spend.

**Acceptance criteria**

- The free allowance and any paid allowance are explicitly decided; marketing, onboarding, dashboard, and API responses show the same limits.
- Manual and scheduled work consult one server-side quota/budget policy; users cannot exceed limits by opening multiple tabs or calling the endpoint directly.
- System-wide daily budget enforcement is atomic across concurrent requests and scheduled work.
- If quota state cannot be checked, new paid work fails safely and the user receives a retryable explanation; existing in-flight runs are not duplicated.
- Usage records expose run count, estimated/actual model cost, outcome, and user/tier to an authorized operator.
- Limits distinguish fair-use protection from account punishment and include an understandable reset time.

**Abuse controls:** Account-level caps, system ceiling, concurrency controls, signup velocity monitoring, and alerting. Avoid relying on IP alone, since households and workplaces share addresses.

**Status:** Run-volume enforcement and outcome records are implemented locally; estimated/actual model cost and an operator report remain pending. Await staging migration and release verification. **Size:** L. **Dependencies:** Usage policy decision and provider usage data.

#### AD-02 — Use production-grade auth for public signups

**As a new user,** I want Google sign-in to use the production identity configuration so I can reliably create and return to my account.

**Acceptance criteria**

- Vercel production uses Clerk production keys and only the intended production domains/redirect URLs.
- Google sign-in, OAuth callback, dashboard redirect, sign-out, and expired-session handling pass an end-to-end production smoke test.
- A deployment guard fails if a production environment is configured with Clerk development keys.
- Auth errors are actionable and do not strand users on a blank loading screen.

**Status:** Explicitly deferred by user. **Size:** M. **Dependencies:** Clerk production credentials and allowed-domain configuration.

### P1 — Improve first value and repeat use

#### AD-03 — Open a previous digest from run history

**As a returning reader,** I want to select a prior successful run and read the papers from that run so useful research does not disappear after today.

**Acceptance criteria**

- Every run with a saved digest is selectable from Recent Runs and the date picker.
- Selecting a run loads its stored paper payload and updates the selected date, status, score, and lens consistently.
- Legacy run rows without a stored payload are labelled “results unavailable for this run”; the UI does not claim their papers can be opened.
- Failed, empty, in-progress, and saved runs have distinct states and accessible labels.
- Direct links preserve the selected run across refresh and can be copied/bookmarked.
- API history remains scoped to the authenticated user and is bounded/paginated.

**Status:** Implemented locally for saved payloads and metadata-only rows. **Size:** M. **Dependencies:** AD-01 persistence guarantees; current `digests` table and API.

#### AD-04 — Shorten onboarding and show value before asking for a full profile

**As a first-time user,** I want a useful first digest with minimal setup so I can judge the product before investing time in personalization.

**Acceptance criteria**

- Onboarding can be completed with one focused interest and sensible defaults; a long project description is optional or deferred.
- Notion remains optional and is clearly presented as an export destination, not a prerequisite.
- The existing lens demo is expanded into a representative end-to-end reader preview before signup, with sample/date status clearly disclosed.
- After setup, the user sees when the next scheduled digest will arrive and has one clear, quota-aware way to request the first digest.
- Setup progress survives refresh and users can go back without losing entries.
- Time from signup to first digest is instrumented; target median is under 3 minutes of active setup.

**Status:** Implemented locally: optional project profile, session-persisted progress, builder-first messaging. **Size:** M. **Dependencies:** AD-01 quota policy; product choice of first audience.

#### AD-05 — Explain why papers were selected

**As a reader,** I want to understand why a paper matches me and what its score means so I can decide what deserves my attention.

**Acceptance criteria**

- Every paper shows a concise reason grounded in configured topics/profile, distinct from claims about scientific quality.
- Score bands and the “Must-Read” threshold have plain-language explanations.
- The app distinguishes model-generated takeaways from source-paper claims and links to the paper/abstract.
- Landing-page counts, sample results, and dashboard counts describe the same real workflow or are clearly illustrative.
- A user can report an irrelevant or low-quality result without hunting for a hidden control.

**Status:** Partially implemented locally: score meaning and claims corrected; per-paper rationale remains pending scoring schema support. **Size:** M. **Dependencies:** scoring output schema and quality review.

#### AD-06 — Let users pause and control scheduled delivery

**As a user,** I want to pause scheduled digests and control delivery channels so the product respects my attention and does not spend resources when I do not need it.

**Acceptance criteria**

- Users can pause/resume their schedule without deleting their profile or history.
- Paused users are excluded from scheduled generation and are not charged against usage quotas.
- The dashboard clearly shows the pause state and the next scheduled run.
- Channel-level delivery can be switched off independently from in-app history.
- Schedule state changes are audited and visible in the UI.

**Status:** The toggle already existed; persistence failure handling and scheduler exclusion were corrected locally. **Size:** M. **Dependencies:** AD-01 quota model and scheduler query.

### P2 — Learn what drives durable value

#### AD-07 — Pick an initial audience wedge and instrument activation

**As the product team,** we want to know which audience receives repeat value so positioning and roadmap follow observed behavior rather than assumptions.

**Acceptance criteria**

- Interview at least five target users across the current personas and record the top recurring job and current alternative.
- Choose one primary acquisition segment; retain other lenses as supported secondary use cases.
- Define and instrument signup, setup completion, first digest opened, paper expanded/saved/rated, week-one return, and unsubscribe/pause.
- Report activation, week-one return, relevant-paper rate, empty/failed-run rate, and cost per active user without collecting paper content or profile text in analytics.
- Review the funnel after a small invitation cohort before increasing acquisition.

**Status:** AI builders selected; allowlisted first-party event capture and privacy disclosure implemented locally. Interviews, reporting, and cohort review remain open. **Size:** M. **Dependencies:** Event taxonomy and privacy review.

#### AD-08 — Make the reading experience work well on mobile and with assistive tech

**As a reader on a phone or using a keyboard/screen reader,** I want to find, understand, and act on papers without fighting the layout.

**Acceptance criteria**

- Mobile users can reach the first paper quickly and access history, filters, settings, and run status without scrolling past the entire digest.
- All icon-only controls have accessible names, focus states are visible, and dialogs/status changes are announced.
- Text, score, and status meaning do not rely on color alone.
- Keyboard-only checks and at least one narrow mobile viewport pass on login, onboarding, dashboard, history selection, and settings.

**Size:** M. **Dependencies:** AD-03 history UI.

#### AD-09 — Add account and data lifecycle controls

**As a user,** I want to export or delete my account data and disconnect integrations so I remain in control of my profile and research history.

**Acceptance criteria**

- Users can export profile, preferences, feedback, and saved digest records in a usable format.
- Users can disconnect Notion and revoke/delete stored credentials through the normal flow.
- Account deletion explains which data is removed and completes safely across linked records and auth identity.
- Privacy/retention behavior is documented in plain language and matches implementation.

**Status:** Export and account deletion controls implemented locally; review cascade behavior and Notion credential revocation before release. **Size:** L. **Dependencies:** retention policy and deletion semantics.

## Recommended sequence

1. AD-01 usage/spend policy and AD-02 production auth are launch gates for public acquisition.
2. AD-03 history navigation closes the most visible repeat-use gap and validates that stored payloads, not only run metadata, are available.
3. AD-04 onboarding and AD-05 score explanations improve activation and trust.
4. AD-06 through AD-09 follow with measured user behavior and the agreed unit economics.

## Open product questions

- Is one manual attempt per UTC day the right pilot allowance after observing failed and successful outcomes? The shared 50/day ceiling is configurable in the database but is not a financial-cost cap.
- Should scheduled delivery be opt-in during onboarding, or enabled by default after setup?
- Validate the activation definition with users and review activation, week-one return, useful-paper rate, failure rate, and cost/active user after the first invitation cohort.
- Add grounded per-paper match explanations and cost telemetry before describing scoring as calibrated or usage limits as spend budgets.

