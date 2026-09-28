---
name: iterate-plan
description: "Update existing implementation plans based on feedback with targeted, surgical research."
---

# RPI Iterate Plan

## Overview

Update existing implementation plans in `docs/plans/` based on user review and feedback. This is the **Iterate** companion to Phase 2 of the Research → Plan → Implement (RPI) pattern.

<HARD-GATE>
YOUR ONLY JOB: SURGICALLY UPDATE THE PLAN.
DO NOT WRITE PRODUCTION CODE OR IMPLEMENT THE CHANGES IN THIS PHASE.
Do not rewrite unaffected sections of the plan — maintain existing progress and structure.
</HARD-GATE>

---

## Mandatory Process

### Step 1: Read and Understand Current Plan

1. **Read the existing plan file COMPLETELY**:
   - Never read files partially. Understand the current structure, phases, and scope.
   - Note which phases are already completed (`- [x]`) and which are pending (`- [ ]`).
2. **Understand the requested feedback**:
   - Determine what the user wants to add, modify, or remove.
   - Identify whether the change requires targeted codebase research.

### Step 2: Targeted Research (If Needed)

**Only research if the feedback introduces new technical uncertainty or unfamiliar code patterns.**
- If needed, inspect specific files or patterns relevant to the feedback.
- Do not re-research already documented, unaffected areas.

### Step 3: Confirm Understanding Before Editing

Present your understanding to the user:
```
Based on your feedback, I understand we need to:
- [Change 1 with specific detail]
- [Change 2 with specific detail]

My investigation found:
- [Relevant code pattern or constraint]

I plan to update the plan by:
1. [Specific phase modification or new phase addition]
2. [Adjustment to success criteria or scope]

Does this align with your intent?
```
Wait for user confirmation before modifying the file.

### Step 4: Make Surgical Updates to the Plan

1. **Apply focused, precise edits** to `docs/plans/YYYY-MM-DD-HHmm-<description>.md`:
   - Use targeted modifications, not wholesale rewrites.
   - If adding a new phase, adhere strictly to the Phase template with automated verification commands and checkboxes (`- [ ]`).
   - If modifying scope, update the "What We're NOT Doing" section.
   - Maintain the distinction between Automated Verification and Manual Verification.
2. **Ensure consistency**:
   - Ensure all file paths, line references, and command flags remain accurate.
   - Never leave unresolved questions or placeholders in an updated plan.

### Step 5: Present Changes & Await Approval

Present the updated plan summary:
```
I've updated the plan at docs/plans/[filename].md:
- [Specific change 1]
- [Specific change 2]

The updated plan is ready for review.
```
Once approved, proceed to **Phase 3** (`implement-plan`) in a fresh session.

---

## Key Guidelines

1. **Be Surgical:** Preserve solid, reviewed phases that do not need adjustments.
2. **Be Skeptical:** If feedback introduces hidden architectural debt or scope creep, point it out and present alternatives.
3. **No Unresolved Questions:** Never leave open questions in a plan ready for implementation.
