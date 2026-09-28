---
name: research-codebase
description: "Research and document codebase for a specific topic before proposing changes. Factual, read-only discovery using locator, analyzer, and pattern subroutines."
---

# RPI Research Codebase

## Overview

Research and document the codebase for a specific topic before proposing any changes. This is **Phase 1** of the Research → Plan → Implement (RPI) pattern.

<HARD-GATE>
YOUR ONLY JOB: DOCUMENT THE CODEBASE AS IT EXISTS TODAY.
- DO NOT suggest improvements or changes.
- DO NOT critique the implementation.
- DO NOT plan or write implementation code.
- ONLY describe what exists, where it exists, and how it works.
- You are creating a factual technical map, not a code review or a design doc.
</HARD-GATE>

---

## Mandatory Workflow — Execute in Order

### Step 1: Read Mentioned Files First
If the user mentions specific files, tickets, or directories, read them FULLY before doing anything else. Never rely on assumptions or partial reads.

### Step 2: Decompose the Research Question
Break down the topic or query into 3–5 specific technical investigation areas:
- Entry points, CLI commands, or route handlers.
- Core business logic, data models, or state management.
- Configuration, environment variables, or feature flags.
- Test suites, fixtures, or mocks.

### Step 3: Execute the 3 Research Subroutines
Execute these three subroutines (in parallel if using sub-agents / Goose subrecipes; or systematically in sequence):

1. **`find_files` (Codebase Locator):**
   - Find WHERE all relevant files, configurations, and modules live across directories.
   - Map filenames, extensions, and directory structure.
2. **`analyze_code` (Codebase Analyzer):**
   - Read the identified files fully to understand HOW the code works.
   - Trace call trees, data flows, inputs, outputs, and dependencies.
   - Note exact file paths and line ranges (`file:///path/to/file.ext#L10-L40`).
3. **`find_patterns` (Pattern Finder):**
   - Identify existing conventions, patterns, or similar features elsewhere in the repository.
   - Identify shared utility functions, base classes, error-handling conventions, and testing idioms to follow.

### Step 4: Gather Git Metadata & Verify Branch
Capture the current repository context and verify branch isolation:
```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
git rev-parse HEAD
git branch --show-current
basename $(git rev-parse --show-toplevel)
```
**Branch Gate:** If `git branch --show-current` is `main` or `master`, STOP. Never implement non-trivial features or refactors directly on the default branch.
Always switch to `main`, pull the latest remote changes, and cut a dedicated feature or fix branch before proceeding to planning:
```bash
git checkout main && git pull origin main && git checkout -b feature/<topic-or-story-name>
```
**Crucial Rule:** Never branch off an unmerged or pre-squashed local feature branch. Squash merges create a new commit SHA on `origin/main`, which will cause false merge conflicts if you branch off a pre-squashed local branch. Always branch from an updated `main`.

### Step 5: Write the Research Document
Create `docs/research/YYYY-MM-DD-[TICKET-]description.md` (e.g., `2026-09-26-ENG-123-auth.md` or `2026-09-26-auth.md`) using this exact structure:

```markdown
---
date: [ISO timestamp from Step 4]
git_commit: [commit hash from Step 4]
branch: [branch name from Step 4]
repository: [repo name from Step 4]
topic: "[Research Topic]"
tags: [research, codebase, relevant-tags]
status: complete
last_updated: [YYYY-MM-DD]
---

# Research: [Topic]

## Research Question
[Original user prompt or task description]

## Summary
[High-level overview of findings without editorializing]

## Detailed Findings

### 1. [Component / Module 1]
- What exists (with exact file:line references)
- How it connects to other components
- Key data structures and signatures

### 2. [Component / Module 2]
...

## Code References
- `path/to/file.ext:123` - Description of role in the system

## Key Design Patterns & Conventions Discovered
- [Pattern 1]: How similar features are implemented
- [Pattern 2]: Testing patterns or error-handling conventions

## Open Questions & Ambiguities
- [Areas needing human clarification or business logic decisions]
```

### Step 6: Present Summary & Await Review
Present a concise summary to the user highlighting key file references and any open questions. 

**Pause here.** Do not proceed to planning or implementation until the user has reviewed the research findings and confirmed the scope.

---

## Important Operational Guardrails

- **Anti-Sycophancy Gate (Verification on User Corrections):** If the user corrects any technical assumption or statement about the codebase, **DO NOT blindly agree or adopt it**. Spawn a targeted investigation to inspect the specific files/directories mentioned. Only accept corrections once verified against actual code on disk.
- **Directory Scoping:** When investigating code, be EXTREMELY specific about directory scopes (e.g. `packages/auth/`, `lib/core/`). Never use ambiguous generic terms like "UI" when you mean a specific directory.
- **Handling Follow-Up Questions:** If the user asks follow-up questions about the same topic, do NOT create a separate fragmented research file. Instead:
  1. Append a new section to the existing research document: `## Follow-up Research [timestamp]`.
  2. Update the frontmatter fields `last_updated` and add `last_updated_note: "Added follow-up research for [brief description]"`.
