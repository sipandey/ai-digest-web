# Anti-Patterns Log — AIDigestWeb

Negative knowledge: things that have already gone wrong here, so nobody
(human or agent) repeats them. One avoided bug is worth more than one
polished example — keep entries short and concrete.

Append a new entry every time:
- a bug slips through and you find the root cause,
- an approach seemed reasonable but turned out wrong,
- a fix gets reverted because it only patched a symptom.

## Format

```
### YYYY-MM-DD — short title

**What happened:** one or two sentences.
**Root cause:** the actual cause, not the symptom.
**Avoid:** the concrete rule that would have prevented it.
```

<!-- Entries go below this line, newest first. -->

### 2026-10-13 — Column grant did not narrow an existing table grant

**What happened:** The live anon key could select `user_id` from active `user_configs` despite a migration granting only two scheduling columns.
**Root cause:** PostgreSQL grants are additive. A column-level `GRANT SELECT` did not revoke the existing table-level `SELECT` grant, while RLS permitted active rows.
**Avoid:** Check effective privileges with the actual anon role and a forbidden-column request. Revoke both table-level and column-level grants before claiming a column boundary; use a narrowly scoped RPC when the gate needs an internal `active` filter.

### 2026-10-13 — Scheduler gate retained a retired Notion prerequisite

**What happened:** The pipeline accepted active users without Notion, but the hourly GitHub Actions check still filtered `notion_connected=true`, so a web-only due user could leave the heavy job skipped. Its intended curl-error fallback also exited early under `bash -e` because the failing command substitution was unguarded.
**Root cause:** The cheap scheduling gate was not updated or tested as part of the earlier Notion decoupling; its query and shell failure path lived outside the Python user-discovery tests.
**Avoid:** Test the real workflow check step against web-only, inactive, future-due, and HTTP-error cases whenever pipeline eligibility changes. Put fallible shell commands inside an `if` guard when the workflow must recover under `errexit`.
