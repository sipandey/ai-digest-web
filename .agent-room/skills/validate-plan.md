---
name: validate-plan
description: "Audit an implementation against its approved plan across code, tests, and schema migrations with triaged reporting."
---

# Plan Validation Auditor

## Overview

Provide an independent post-implementation validation gate to ensure the implementation faithfully, safely, and completely realized every phase of the approved implementation plan. This skill audits code modifications, schema migrations, and test coverage, triaging findings into structured categories and persisting an audit report under `docs/reviews/`.

Invokable as `/validate_plan` or `/validate-plan`.

<HARD-GATE>
1. DO NOT RUBBER-STAMP: You are an independent auditor, not an implementation cheerleader. Scrutinize every line of code, test case, and schema against the plan.
2. NEVER claim a phase or plan passes without actively executing automated test/verification commands in this turn and reading their output.
3. NEVER modify application code or schemas during an audit session. Your sole responsibility is to audit, triage, and emit the validation report. If fixes are required, document them under Action Required.
4. Ensure all findings are classified into standard triage buckets: Matches Plan (🟢), Deviations from Plan (🟡), Potential Issues (🔴), and Manual Testing Required (🔵).
</HARD-GATE>

---

## Validation Process

Follow this sequential workflow:

```
┌────────────────────────────────────────────────────────┐
│ 1. Context Discovery & Plan Identification             │
│    Locate plan in docs/plans/, inspect commits & diffs │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Execute 3-Vector Audit                              │
│    • Vector 1: Database & Schema Migrations            │
│    • Vector 2: Code Modifications vs. Plan Specs       │
│    • Vector 3: Automated Test Coverage & Verification  │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Triage Classification                               │
│    🟢 Matches  🟡 Deviations  🔴 Issues  🔵 Manual     │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Emit Validation Report Artifact                     │
│    Write docs/reviews/YYYY-MM-DD-[TICKET-]validation.md│
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 5. Deliver Verdict & Remediation Guidance to User      │
│    PASSED / PASSED WITH WARNINGS / FAILED              │
└────────────────────────────────────────────────────────┘
```

---

### Step 1: Context Discovery & Plan Identification

1. **Locate the target plan**:
   - Inspect `docs/plans/` for the relevant plan (user-specified or latest `docs/plans/YYYY-MM-DD-*.md`).
   - Read the plan file COMPLETELY into context. Do not skim or read partially.
   - Note all phases, specified deliverables, file paths, line ranges, and automated verification commands.

2. **Inspect Git Context**:
   - Check active branch: `git branch --show-current`.
   - Inspect recent commits: `git log -n 20 --oneline`.
   - Inspect full changeset: `git diff origin/main...HEAD` (or `git diff HEAD~N..HEAD` if not branched from origin/main) and `git status --short`.
   - List all modified, added, and deleted files.

---

### Step 2: Execute 3-Vector Audit

Evaluate the implementation across three independent vectors:

#### Vector 1: Database & Schema Migrations
- Check for database migrations, ORM schemas, configuration files, and data models.
- **Verification Criteria**:
  - Do schema definitions match plan specifications (types, nullability, defaults)?
  - Are foreign keys, indexes, and constraints properly configured?
  - Is backward compatibility maintained? Can existing data migrate cleanly?
  - Is there a rollback migration or downgrade path if required by the plan?
  - If no database changes were planned, verify no unexpected schema changes were introduced.

#### Vector 2: Code Modifications vs. Plan Specifications
- Compare actual code changes against each phase in the plan.
- **Verification Criteria**:
  - Were all files specified in each phase created or modified as planned?
  - Do function signatures, classes, APIs, and exported symbols match the plan?
  - **Missing Requirements**: Identify any planned phase, task, or edge-case handling that was omitted.
  - **Scope Creep / Unplanned Code**: Identify any modified files, added packages, or code logic that was NOT authorized by the plan.
  - Check architectural boundary compliance (e.g. import boundaries from `.agent-room/guardrails.json`).

#### Vector 3: Automated Test Coverage & Verification
- Scrutinize the testing implementation.
- **Verification Criteria**:
  - Does every planned capability have corresponding automated tests (unit, integration, or contract)?
  - Do tests assert both happy paths and error conditions/boundary edge cases?
  - **Run the automated verification commands**: Execute the plan's verification command(s) directly in this turn:
    ```bash
    npm test # or specified test command
    ```
  - Read the test output. Verify tests actually executed, passed, and produced zero failures or unhandled rejections.

---

### Step 3: Triage Classification

Categorize every finding into one of four standard buckets:

1. 🟢 **Matches Plan**:
   - Capabilities, files, and tests that directly and faithfully implement the plan specifications.
2. 🟡 **Deviations from Plan**:
   - Implementations that diverge from the plan but are justifiable (e.g. better helper extracted, slightly adjusted API signature). Document rationale.
3. 🔴 **Potential Issues**:
   - Defects, missing requirements, failing verification commands, security flaws, missing test coverage, or unhandled errors.
4. 🔵 **Manual Testing Required**:
   - End-to-end user flows, interactive UI behaviors, external webhook integrations, or environmental checks that cannot be verified via automated scripts.

---

### Step 4: Emit Validation Report Artifact

Create `docs/reviews/` if it does not already exist.
Write a structured validation report to `docs/reviews/YYYY-MM-DD-[TICKET-]validation.md` (e.g., `docs/reviews/2026-09-26-ENG-123-validation.md` or `docs/reviews/2026-09-26-validation.md`):

```markdown
---
date: [ISO 8601 timestamp]
git_commit: [full commit SHA]
branch: [active branch name]
plan_file: docs/plans/YYYY-MM-DD-...md
status: [PASSED | PASSED_WITH_WARNINGS | FAILED]
auditor: validate-plan
---

# Plan Validation Report: [Feature / Story Name]

## Executive Verdict

**Verdict:** [PASSED | PASSED WITH WARNINGS | FAILED - ACTION REQUIRED]

- **Summary:** [1-2 sentences summarizing overall compliance with the plan.]
- **Phase Compliance:** [N of M phases verified complete]
- **Verification Command:** `[command]` -> [Passed / Failed]

---

## 3-Vector Audit Results

### 1. Database & Schema Migrations
- **Status:** [Compliant | N/A | Non-Compliant]
- **Findings:**
  - [Finding 1]

### 2. Code Modifications vs. Plan Specifications
- **Status:** [Matches Plan | Deviations Found | Missing Requirements]
- **Findings:**
  - [Finding 1]

### 3. Automated Test Coverage & Verification
- **Status:** [All Tests Passing | Gaps Identified | Verification Failed]
- **Command Output Summary:** [Test suite pass count, duration]
- **Findings:**
  - [Finding 1]

---

## Triage Breakdown

### 🟢 Matches Plan
- [Deliverable 1 that matches plan]
- [Deliverable 2 that matches plan]

### 🟡 Deviations from Plan
- [Deviation 1 and why it occurred]

### 🔴 Potential Issues
- [Issue 1: description, severity, and impacted file/line]

### 🔵 Manual Testing Required
- [Manual test scenario 1]

---

## Action Items & Next Steps
1. [Actionable remediation step or proceed to /commit]
```

---

### Step 5: Deliver Verdict to User

Conclude the audit by presenting the executive verdict and findings summary:
- If **PASSED**: Confirm that all phases match, verification commands pass, and changes are ready to be committed via `/commit`.
- If **PASSED WITH WARNINGS**: Highlight deviations and non-blocking items.
- If **FAILED - ACTION REQUIRED**: Clearly enumerate blocking issues (failing tests, missing phase implementations, severe regressions) and advise whether to address them directly or run `/iterate_plan` to adjust the plan first.
