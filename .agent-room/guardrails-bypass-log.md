# Guardrails Bypass Log — create-agent-room

Append-only, machine-written record of every commit that used
`GUARDRAILS_BYPASS=1` (or `SKIP_GUARDRAILS_CHECK=1`) to override a blocked
commit. Written automatically by `.agent-room/hooks/guardrails-check.js` -
do not edit by hand; edits here don't reflect what actually happened.

Review this periodically (or in code review) so bypasses stay visible
instead of scrolling off a terminal and being forgotten.

<!-- Entries below this line, newest first, appended automatically. -->
- 2026-09-28T12:02:49.634Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/guardrails.json; Protected path violation: .agent-room/guardrails.md; Protected path violation: .agent-room/hooks/close-the-loop-check.js; Protected path violation: .agent-room/hooks/closing-the-loop-evidence.js; Protected path violation: .agent-room/hooks/guardrails-check.js; Protected path violation: .claude/settings.json; Protected path violation: .github/workflows/agent-room-validate.yml; Change scope exceeds guidance: 66 files changed (limit 20); Change scope exceeds guidance: 6848 lines changed (limit 500)
