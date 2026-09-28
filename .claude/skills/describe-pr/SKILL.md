---
name: describe-pr
description: "Synthesize comprehensive PR descriptions with deep architectural diff analysis, verified execution proofs, and GitHub CLI sync."
---

# Attested PR Description Workflow

## Overview

Synthesize clear, complete, and verifiable pull request descriptions by combining deep architectural diff analysis with automated execution attestation proofs (`create-agent-room pr-desc --verify`). This skill ensures all PRs document user-facing versus internal impacts, breaking changes, and migrations, while embedding cryptographic or execution test proofs directly into GitHub pull requests.

Invokable as `/describe_pr` or `/describe-pr`.

<HARD-GATE>
1. NEVER edit or update a PR description on GitHub (`gh pr edit`) without first presenting the draft to the human and obtaining explicit confirmation.
2. ALWAYS generate and embed a verified execution proof by running `create-agent-room pr-desc . --verify --output .agent-room/pr-description.md` (or `node bin/cli.js pr-desc . --verify --output .agent-room/pr-description.md`). Never hand-wave or invent test proofs.
3. ALWAYS evaluate whether changes contain Breaking Changes, User-Facing alterations, or Schema Migrations, and highlight them prominently.
4. Respect repository PR templates: if `.github/pull_request_template.md` exists, adhere to its sections while embedding CAR's architectural breakdown and attestation proof.
</HARD-GATE>

---

## PR Description Workflow

Follow this sequential workflow:

```
┌────────────────────────────────────────────────────────┐
│ 1. Discover PR Context & Template                      │
│    gh pr view, check .github/pull_request_template.md  │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Conduct Architectural Diff Analysis                 │
│    gh pr diff, classify User-Facing / Internal / Break │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Generate Execution Attestation Proof                │
│    create-agent-room pr-desc . --verify --output ...   │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Synthesize Final PR Description Document            │
│    Merge architectural diff analysis with attestation  │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 5. Interactive Approval Gate                           │
│    "Shall I update the PR description on GitHub?"      │
└──────────────────────────┬─────────────────────────────┘
                           ▼
                 Approved? ──► No ──► Refine description with feedback
                           │
                          Yes
                           ▼
┌────────────────────────────────────────────────────────┐
│ 6. Synchronize to GitHub via gh CLI                    │
│    gh pr edit <number> --body-file <path>              │
└────────────────────────────────────────────────────────┘
```

---

### Step 1: Discover PR Context & Template

1. **Verify active branch**:
   - Check `git branch --show-current`. Ensure you are on the intended feature or fix branch.

2. **Inspect GitHub PR status**:
   - Check if a PR already exists for the branch:
     ```bash
     gh pr view --json number,title,body,baseRefName,headRefName,url
     ```
   - Note the PR number and base branch (typically `main`).

3. **Locate PR template**:
   - Check for repository PR templates:
     - `.github/pull_request_template.md`
     - `.github/PULL_REQUEST_TEMPLATE/*.md`
     - `pull_request_template.md`
   - If present, read the template into context.

---

### Step 2: Conduct Architectural Diff Analysis

1. **Inspect PR changes**:
   - View full diff against base branch:
     ```bash
     gh pr diff # or git diff origin/main...HEAD
     ```
   - View commit history:
     ```bash
     git log origin/main...HEAD --oneline
     ```

2. **Classify changes across 4 architectural dimensions**:
   - **User-Facing Changes**: New CLI commands, flags, public APIs, exported symbols, UI enhancements, or altered runtime defaults.
   - **Internal Architecture**: Internal helpers, refactors, hook scripts, registries, or performance optimizations.
   - **Breaking Changes**: Modified parameter contracts, deprecated or removed APIs, altered file formats, or incompatible CLI behavior.
   - **Database & Schema Migrations**: Migration files, ORM model modifications, schema additions, or rollback steps.

---

### Step 3: Generate Execution Attestation Proof

Run `create-agent-room pr-desc` with `--verify` to execute tests, verify guardrail compliance, and generate verifiable execution metrics:

```bash
create-agent-room pr-desc . --verify --output .agent-room/pr-description.md
```
*(If running within the create-agent-room repository itself, use `node bin/cli.js pr-desc . --verify --output .agent-room/pr-description.md`)*.

This automatically captures:
- Latest session log context from `.agent-room/sessions/`.
- Verified execution command, duration, timestamp, and exit code (`0`).
- Console output snippet for test verification.
- Guardrails compliance attestation (audited bypasses).
- Reviewer compliance checklist (`- [x] Tests verified passing`).

---

### Step 4: Synthesize Final PR Description

Merge the architectural analysis from Step 2 into the generated draft at `.agent-room/pr-description.md`.
If the repository has a PR template, conform to its required sections.

The final synthesized description should follow this structure:

```markdown
## Summary
[1-3 sentences describing the high-level intent, user problem solved, and PR scope.]

### Architectural Changes Breakdown
- **User-Facing:** [CLI flags, public APIs, outward-facing behaviors added or altered]
- **Internal:** [Internal refactorings, registry updates, adapter synchronization]
- **Breaking Changes:** [None / Detailed description of breaking changes and migration path]
- **Database / Migrations:** [None / Schema migrations applied]

## Verification & Testing
- Automated test suite executed and passed cleanly.
- Linter and room integrity checks passed.

### Verification Attestation Proof
* **Verification Command:** `[command]`
* **Result:** Passed ✅
* **Exit Code:** `0`
* **Duration:** `[duration]`
* **Timestamp:** `[ISO timestamp]`

<details open>
<summary>Console Output</summary>

```
[Output summary from test execution]
```
</details>

## Reviewer Compliance Checklist
- [x] Automated verification test suite passing
- [x] Architectural decisions documented in `.agent-room/decisions.md`
- [x] Guardrail policies satisfied (zero unapproved bypasses)
- [x] Session log recorded under `.agent-room/sessions/`
- [x] Scope boundaries respected during task execution
```

Save the synthesized content to `.agent-room/pr-description.md`.

---

### Step 5: Interactive Approval Gate

Present the formulated PR description to the human user:

```
I have formulated the pull request description with verified execution proofs in `.agent-room/pr-description.md`.

Shall I update the PR description on GitHub?
```

Wait for explicit user confirmation before touching the remote PR.

---

### Step 6: Synchronize to GitHub via `gh` CLI

Upon user confirmation:

- **Update existing PR**:
  ```bash
  gh pr edit <number> --body-file .agent-room/pr-description.md
  ```

- **Create new PR (if not already opened)**:
  ```bash
  gh pr create --body-file .agent-room/pr-description.md
  ```

Display the updated PR URL to confirm completion.
