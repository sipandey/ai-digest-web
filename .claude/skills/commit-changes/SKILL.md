---
name: commit-changes
description: "Formulate atomic git commits with pre-commit guardrail verification, user approval gate, and zero AI attribution."
---

# Atomic Commit Workflow

## Overview

Formulate and execute clean, atomic git commits for changes made during an agent session. This skill enforces pre-commit guardrail verification, imperative commit messaging, safe staging, clean user attribution, and mandatory human confirmation gates.

<HARD-GATE>
1. NEVER add co-author information or AI attribution (no "Co-Authored-By", no "Generated with Claude/AI").
   Commits must be authored solely under the user's verified git identity.
2. NEVER use catch-all staging: "git add -A", "git add .", or "git commit -a" are strictly forbidden. Only stage specific, individual files.
3. NEVER commit changes without presenting the commit plan to the user and obtaining explicit approval first.
4. NEVER run "git push" without separate, explicit user instruction.
</HARD-GATE>

---

## Commit Process

Follow this sequential workflow:

```
┌────────────────────────────────────────────────────────┐
│ 1. Inspect Changes & Verify Pre-Conditions             │
│    git status, git diff, author identity, branch check │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Formulate Atomic Commit Plan                        │
│    Group related files, check 20-file/500-line limits  │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Present Plan to User & Await Confirmation           │
│    "I plan to create [N] commit(s)... Shall I proceed?"│
└──────────────────────────┬─────────────────────────────┘
                           ▼
                 Approved? ──► No ──► Adjust plan based on feedback
                           │
                          Yes
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Execute Commits Atomically                          │
│    git add <specific-files> && git commit -m "..."     │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 5. Display Git Log Result & Status                     │
│    git log --oneline -n [N] (do NOT push)              │
└────────────────────────────────────────────────────────┘
```

---

### Step 1: Inspect Changes & Verify Pre-Conditions

Before formulating commits:
1. **Understand what changed**:
   - Review conversation history, active tickets, and implementation plan.
   - Run `git status` to see unstaged and untracked changes.
   - Run `git diff` to understand modifications line by line.
2. **Verify active branch**:
   - Check `git branch --show-current`.
   - Ensure changes are on a dedicated feature or fix branch (`feature/...`, `fix/...`), never directly on `main` or `master`.
   - Ensure the branch was cut from an up-to-date `main` (`git checkout main && git pull origin main && git checkout -b feature/<name>`), never branched off an unmerged or pre-squashed local feature branch.
3. **Verify author identity**:
   - Run `git config user.name && git config user.email`.
   - Ensure commits will be recorded under the repository's authorized user identity (per `AGENTS.md`).

---

### Step 2: Formulate Atomic Commit Plan

1. **Logical Grouping**:
   - Separate distinct concerns into separate commits:
     - Core implementation vs. test fixtures vs. documentation vs. auto-generated sync files.
   - Never create a monolithic "catch-all" commit for multiple unrelated tasks.
2. **Blast-Radius Scope Guidance**:
   - Inspect `.agent-room/guardrails.json`.
   - Ensure no planned commit exceeds `maxFilesPerChange` (default: 20 files) or `maxLinesPerChange` (default: 500 lines).
   - If a change is larger, decompose it into smaller, logically coherent commits.
3. **Draft Commit Messages**:
   - Follow Conventional Commits format: `<type>(<scope>): <short summary>`.
   - Use imperative mood in the title ("add feature", "fix timeout", not "added" or "adds").
   - Include a body explaining *why* the change was made, not just what files were touched.

---

### Step 3: Present Plan to User (Interactive Approval Gate)

Present the formulated commit plan clearly to the user:

```
### Proposed Commit Plan

#### Commit 1: <type>(<scope>): <summary>
* **Files (N files):**
  - path/to/file1
  - path/to/file2
* **Message:**
  <Full commit message including body>

#### Commit 2: <type>(<scope>): <summary>
* **Files (N files):**
  - path/to/file3
* **Message:**
  <Full commit message including body>

I plan to create [N] commit(s) with these changes. Shall I proceed?
```

<HARD-GATE>
STOP turn and wait for the user to respond. Do NOT run `git add` or `git commit` until the user confirms.
</HARD-GATE>

---

### Step 4: Execute Commits Atomically

Upon user confirmation:
1. For each commit in the approved plan:
   - Stage exact files:
     ```bash
     git add path/to/file1 path/to/file2
     ```
   - Commit with the planned message:
     ```bash
     git commit -m "<title>" -m "<body>"
     ```
2. Verify that pre-commit hooks (such as `guardrails-check.js`) pass without errors.
3. If a pre-commit hook fails:
   - Read the exact violation output.
   - Do NOT force or bypass without explicit user waiver and audit logging.

---

### Step 5: Display Verification & Complete

1. Show the created commits:
   ```bash
   git log --oneline -n [number_of_commits]
   ```
2. Verify that working tree is in the expected state:
   ```bash
   git status
   ```
3. Inform the user that commits are recorded locally.
4. **Do NOT run `git push`** unless the user explicitly requested pushing in their prompt.
