# Session Log: require-digest-persistence

**Date:** 2026-11-13 05:52
**Agent:** Siddharth Pandey
**Classification:** Bug

## Goal
Prevent successful pipeline runs from hiding a failed save of the dashboard digest.

## Files touched
- Modified: pipeline/pipeline.py
- Modified: pipeline/tests/test_lenses.py

## Actions taken
1. Added a regression test confirming that digest persistence errors propagate.
2. Changed digest upsert errors to reach the pipeline's existing failed-run handler.
3. Committed as 1086bf9.

## Tests run
- Command: pytest pipeline/tests/test_lenses.py -q -k save_user_digest_raises_when_persistence_fails
- Result: Failed before the fix because the persistence exception was swallowed.
- Command: pytest pipeline/tests/test_lenses.py -q
- Result: Pass (22 tests).
- Command: git diff --check
- Result: Pass.

## Decisions made
- Architecture Decision: Restrict anonymous scheduling access through an RPC (see .agent-room/decisions.md)
- Architecture Decision: Home screen and dashboard refinement (Bookmarking, Sticky Precision Strip, Multi-Persona Lens, Smart Session) (see .agent-room/decisions.md)

## Outcome
**Status:** In Progress — awaiting push, review, and production deployment verification.
