# Agent Instructions — AIDigestWeb (TypeScript)

This file supplements the base AGENTS.md with TypeScript-specific guidance.

## TypeScript-specific workflow

1. **Strict Mode:** Always compile with `"strict": true` in tsconfig.json.
2. **Type Safety:** Write types for public APIs; use `unknown` before `any`.
3. **Testing:** Use Jest or Vitest; write tests first (TDD), then implement.
4. **Linting:** Run ESLint with TypeScript plugin; fix all errors before committing.
5. **Build:** Compile TypeScript before running; catch type errors in CI.

## Language-specific principles

- **Explicit over implicit:** Declare types, don't rely on inference alone
- **Interfaces for contracts:** Define interfaces for API boundaries
- **Discriminated unions:** Use discriminated unions for type-safe variant handling
- **Avoid `any`:** Use generics or `unknown` instead
- **Strict null checks:** Enable strictNullChecks to prevent null reference errors

## Common pitfalls

- ❌ Leaving `any` in production code
- ❌ Not checking for null/undefined (nullish coalescing is your friend)
- ❌ Over-using generics; keep types readable
- ❌ Ignoring TypeScript errors with `@ts-ignore`
- ✅ Use `.ts` for backend, `.tsx` for React components

## Stack and Test Commands

This repository is a monorepo consisting of:
- **`web/`**: Next.js 16 app (TypeScript, React 19, Tailwind CSS v4, Clerk, Supabase, Upstash Redis, Vitest)
- **`pipeline/`**: Python arXiv digest pipeline (pytest, Supabase, OpenAI GPT-4o-mini, Notion API)
- **`supabase/`**: Postgres schema, RLS policies, and SQL migrations

Commands:
- Combined verification: `npm test`
- Web Vitest tests: `npm run test:web` (or `npm test --prefix web`)
- Pipeline Pytest tests: `npm run test:pipeline` (or `pytest pipeline/tests/ -v`)
- Agent room governance: `npm run validate` / `npm run eval` / `npm run doctor`

## Git identity & rules

Use this identity for commits in this repo:

```bash
git config user.name "Siddharth Pandey"
git config user.email "siddharth.pandey06@gmail.com"
```

Re-verify (`git config user.name && git config user.email`) before any
push, not just at session start — a global config change or a fresh clone
mid-session can silently reset it.

- Always start a new task by updating main and cutting from latest origin:
  ```bash
  git checkout main && git pull origin main && git checkout -b feature/<name>
  ```
  Never cut a feature branch directly from another unmerged or pre-squashed feature branch, as squashed remote merges will cause false merge conflicts.
- Do not run `git push` unless explicitly asked.
- Do not amend or rewrite history on shared branches without being asked.

See `.agent-room/principles.md` and `.agent-room/workflow-classifier.md` for the full playbook.

