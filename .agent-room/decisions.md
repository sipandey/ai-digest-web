# Decisions Log — AIDigestWeb

Short, append-only record of architecture/design decisions and why. A
decision belongs here if a future session (or a future you) would otherwise
have to re-derive it from scratch by reading git history.

## Format

```
### YYYY-MM-DD — short title

**Decision:** what was decided.
**Why:** the constraint or trade-off that drove it.
**Rejected:** what else was considered, and why it lost.
```

<!-- Entries go below this line, newest first. -->

### 2026-09-28 — Integrate create-agent-room v2.6.0 governance framework

**Decision:** Integrated create-agent-room v2.6.0 with standard profile, multi-tool rule sync across Claude, Cursor, Copilot, Windsurf, Cline, Codex, and full Git lifecycle hooks. Configured combined verification command (`npm test --prefix web && pytest pipeline/tests/ -q`) covering both Next.js/Vitest and Python/pytest suites. Added root package.json pinning create-agent-room@2.6.0 with convenience scripts.
**Why:** Establishes mechanical seatbelts (pre-commit guardrails, pre-stop test verification, anti-tamper, compliance evals) to ensure AI agents cannot break tests, leak credentials, or skip architectural decisions.
**Rejected:** Minimal preset without pre-stop test gate (too permissive for a dual-stack monorepo); running only web or only pipeline tests in verification (incomplete coverage).

