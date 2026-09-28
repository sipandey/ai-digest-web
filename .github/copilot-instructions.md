# GitHub Copilot instructions — AIDigestWeb

Read [`AGENTS.md`](../AGENTS.md) and everything under
[`.agent-room/`](../.agent-room/) before making non-trivial changes:

- `.agent-room/principles.md` — how to get reliable output from the model.
- `.agent-room/workflow-classifier.md` — size the process to the work
  (Bug / Enhancement / Feature / Product).
- `.agent-room/skills/` — closing-the-loop, commit-changes, database-migrations, describe-pr, implement-plan, integration-testing, iterate-plan, python-testing, research-codebase, security-principles, systematic-debugging, test-driven-development, typescript-testing, validate-plan, writing-plans. Follow these as procedures,
  not suggestions.
- `.agent-room/anti-patterns.md` and `.agent-room/decisions.md` — check
  before repeating a past mistake; append after a new one or a notable
  decision.

## Core rules

1. **Always read AGENTS.md first.** It is the entry point for architectural and operational context.
2. **Follow TDD:** Write or update tests before or alongside implementation changes.
3. **Verify before completion:** Run project tests and validation checks to leave the codebase in a shippable state.
4. **Close the loop:** Record architectural decisions in `.agent-room/decisions.md` and anti-patterns in `.agent-room/anti-patterns.md`.
