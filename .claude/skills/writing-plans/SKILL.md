---
name: writing-plans
description: "Create detailed implementation plans through an interactive, phased process based on factual research before touching code."
---

# RPI Create Plan

## Overview

Create detailed, phased implementation plans through an interactive, collaborative process based on factual codebase research. This is **Phase 2** of the Research → Plan → Implement (RPI) pattern.

<HARD-GATE>
YOUR ONLY JOB: PLAN THE IMPLEMENTATION.
DO NOT WRITE PRODUCTION CODE, MODIFY SOURCE FILES, OR SCAFFOLD CODE DURING THIS PHASE.
Implementation happens in a fresh session using the `implement-plan` skill after this plan is reviewed and approved.
</HARD-GATE>

---

## Mandatory Process

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files immediately and FULLY**:
   - Ticket files, user prompts, related design docs, and especially the research document from `docs/research/`.
   - Never rely on partial context.
2. **Analyze and verify understanding**:
   - Cross-reference requirements with codebase reality discovered during the research phase.
   - Identify discrepancies, constraints, or hidden dependencies.
   - **Anti-Sycophancy Gate:** If the user corrects any technical assumption, do NOT blindly accept it. Inspect the specific code files mentioned to verify reality before adopting the correction.
3. **Present informed understanding and focused questions**:
   - Summarize what needs to be accomplished based on the research.
   - Only ask questions you genuinely cannot answer through code investigation.
   - Multiple-choice questions are strongly preferred over open-ended ones.

### Step 2: Design Options & Alignment

Before writing the full plan:
1. **Present 2–3 architectural approaches** with trade-offs:
   ```
   Design Options:
   1. Option A (Recommended): [Pros / Cons / Rationale]
   2. Option B: [Pros / Cons / Rationale]
   ```
2. **Confirm user alignment** on the chosen approach.

### Step 3: Plan Outline Alignment

Propose the phase outline in dependency order (e.g., Core Models → Integration Logic → CLI/API Routes → Documentation & Tests):
```
Proposed Implementation Phases:
1. Phase 1: [Descriptive Name] - [What it accomplishes]
2. Phase 2: [Descriptive Name] - [What it accomplishes]
3. Phase 3: [Descriptive Name] - [What it accomplishes]
```
Confirm the ordering and granularity before writing the complete plan.

### Step 4: Write the Implementation Plan

<HARD-GATE>
ZERO OPEN QUESTIONS OR PLACEHOLDERS IN FINAL PLAN:
If you encounter technical uncertainties during planning, STOP. Resolve them immediately through code inspection or user dialogue. Never output a plan containing "TBD", "TODO: figure out schema", or unresolved architectural questions. The implementation plan must be 100% complete, unambiguous, and mechanically executable.
</HARD-GATE>

Save the complete plan to `docs/plans/YYYY-MM-DD-[TICKET-]description.md` (e.g., `2026-09-26-ENG-123-auth.md` or `2026-09-26-auth.md`) using this exact template:

````markdown
# [Feature / Task Name] Implementation Plan

**Goal:** [One-sentence summary of what this builds or refactors]
**Architecture:** [2-3 sentences explaining the technical strategy]
**Tech Stack:** [Key languages, runtimes, test frameworks, libraries]

---

## Current State Analysis
[Summary of existing implementation based on docs/research/ with file:line references]

### Key Discoveries:
- [Finding with exact file:line reference]
- [Pattern or idiom to follow]
- [Constraint to respect]

## Desired End State
[Specification of the completed feature/refactor and how it will be verified]

## What We're NOT Doing
[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach
[High-level strategy and dependency sequencing]

---

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component / File Group]
**Files**:
- Create: `exact/path/to/new-file.ext`
- Modify: `exact/path/to/existing-file.ext:10-50`
- Delete: `exact/path/to/deprecated-file.ext`

**Changes**: [Summary of changes]

```[language]
// Specific code to add, modify, or remove
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `<exact test command>` (e.g., `npm test`, `cargo test`)
- [ ] Linting passes: `<exact lint command>` (e.g., `npm run lint`)
- [ ] Type check passes: `<exact typecheck command>` (if applicable)

#### Manual Verification:
- [ ] [Specific observable behavior in UI/CLI]
- [ ] [No regression in related flow]

**Implementation Note**: Pause for manual confirmation if manual verification is required before proceeding.

---

## Phase 2: [Descriptive Name]
[Repeat the Phase structure above...]

---

## Testing Strategy

### Unit Tests:
- [Target files and edge cases]

### Integration / Regression Tests:
- [End-to-end flows and boundary conditions]

---

## Rollback Plan
[Step-by-step instructions to revert changes safely if critical issues occur]
````

### Step 5: Present Plan & Await Approval

Show the user the summary of the plan and the path `docs/plans/YYYY-MM-DD-HHmm-<description>.md`.

- If the user has adjustments, use the `iterate-plan` skill to update the plan surgically.
- Once approved, proceed to **Phase 3** (`implement-plan`) in a fresh session.
