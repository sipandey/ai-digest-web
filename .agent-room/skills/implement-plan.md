---
name: implement-plan
description: "Implement an approved technical plan phase by phase with automated verification and live checkbox tracking."
---

# RPI Implement Plan

## Overview

Implement an approved technical plan from `docs/plans/` phase by phase with strict automated verification and live checkbox tracking. This is **Phase 3** of the Research → Plan → Implement (RPI) pattern.

<HARD-GATE>
IMPLEMENTATION SHOULD FEEL MECHANICAL AND INTENTIONALLY BORING.
Trust the plan. If implementation feels creative or ambiguous, an upstream architectural question was missed.
Do not re-search or rediscover what is already documented in the plan.
Never claim a phase is complete without executing the phase's automated verification command in this turn.
</HARD-GATE>

---

## Getting Started

When given an implementation plan path:
1. **Verify active branch**:
   - Check `git branch --show-current`. Ensure you are on a dedicated feature or fix branch (`feature/...`, `fix/...`), never directly on `main` or `master`.
   - Ensure the branch was cut from an up-to-date `main` (`git checkout main && git pull origin main && git checkout -b feature/<name>`). Never branch off an unmerged or pre-squashed local feature branch.
2. **Read the plan completely**:
   - Inspect all phases and check for existing checkmarks (`- [x]`).
   - Read all files mentioned in the plan FULLY into context.
3. **Resume cleanly if resuming**:
   - Trust that completed phases (`- [x]`) are finished.
   - Start immediately at the **first unchecked phase (`- [ ]`)**.
4. **Trust the plan**:
   - Use exact file paths, line ranges, and replacement code directly from the plan.
   - Do not perform redundant codebase scans for items already specified in the plan.

---

## Phase Execution Loop

For each pending phase in the plan:

```
┌────────────────────────────────────────────────────────┐
│ 1. Read Phase Changes & Files Required                 │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Apply Code Changes (TDD: Test -> Code -> Refactor)  │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Execute Automated Verification Command              │
└──────────────────────────┬─────────────────────────────┘
                           ▼
                Passed? ──► No ──► Fix root cause & rerun
                           │
                          Yes
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Update Disk Checkbox: - [ ] -> - [x] in Plan File   │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 5. Manual Verification Required?                       │
│    Yes -> Pause turn & present criteria to user        │
│    No  -> Proceed to next phase or commit              │
└────────────────────────────────────────────────────────┘
```

### Step 1: Implement the Phase Changes
- Write failing unit tests for new behavior first.
- Write the minimal code to satisfy the tests.
- Apply exact file deletions or refactors as specified in the plan.

### Step 2: Run Automated Verification
- Run the **exact automated command** defined in the phase's success criteria (e.g., `npm test`, `cargo test`, `npm run lint`).
- Read the real terminal output — exit code, error messages, and failure counts.
- Never proceed if tests fail or produce unexpected warnings.

### Step 3: Check Off Completed Items in the Plan File
- Directly edit the plan file in `docs/plans/` on disk:
  Update the phase checkbox from `- [ ]` to `- [x]`.
- This ensures that if the agent's context window is compacted or a new session is started, execution can resume without amnesia or repeated work.

### Step 4: Handle Manual Verification (If Applicable)
- If the phase specifies manual verification items (UI checks, human confirmation):
  - **Do NOT check off manual items yourself.**
  - Inform the user:
    ```
    Phase [N] Complete — Ready for Manual Verification
    
    Automated verification passed:
    - [List automated checks that passed with commands]
    
    Please perform manual verification:
    - [List manual checks from plan]
    
    Let me know when manual testing is confirmed so I can proceed to Phase [N+1].
    ```

---

## Handling Mismatches & Blockers

If reality diverges from the plan (e.g., a file structure changed or an unexpected compile error occurs):
1. **STOP immediately.** Do not guess or silently improvise.
2. Present the mismatch clearly to the user:
   ```
   Issue Encountered in Phase [N]:
   - Expected: [What the plan specifies]
   - Actual:   [What the codebase currently shows]
   - Impact:   [Why this prevents proceeding]
   
   How would you like to proceed?
   ```
3. If necessary, use `iterate-plan` to update the plan before resuming.

---

## Closing the Loop (Completion Gate)

When all phases in the plan are marked `- [x]`:
1. Run the repository's full verification suite (`npm test && npm run lint`).
2. Follow `.agent-room/skills/closing-the-loop.md`:
   - Append architectural decisions to `.agent-room/decisions.md`.
   - Append anti-patterns or bug fixes to `.agent-room/anti-patterns.md`.
3. Log the session state via `create-agent-room session --record`.
