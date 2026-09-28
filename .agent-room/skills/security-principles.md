---
name: security-principles
description: "Use when dealing with database operations, authentication, user input parsing, secrets management, API security, or any code that handles untrusted data."
---

# Security Principles

## Overview

Secure coding is not an afterthought — it's a default. Agents must write
secure code from the first line. A security bug that ships is orders of
magnitude more expensive than one caught during development.

## The iron law

```
ALL CLIENT DATA IS UNTRUSTED UNTIL VALIDATED ON THE SERVER
```

This applies to query parameters, request bodies, headers, cookies, file
uploads, and URL paths. No exceptions. "The frontend validates it" is not
a security control — it's a convenience for the user.

## The threat model

### 1. Injection attacks

**Rule:** Never construct queries, commands, or markup by concatenating
user input.

- **SQL:** Always use parameterized queries or ORMs. Never build query
  strings with template literals or concatenation.
  ```
  BAD:  db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)
  GOOD: db.query('SELECT * FROM users WHERE id = $1', [req.params.id])
  ```
- **NoSQL:** Same rule applies. MongoDB's `$gt`, `$ne` operators in
  user input can bypass authentication. Validate input types explicitly.
- **OS commands:** Never pass user input to `exec()` or `system()`. Use
  `execFile()` with an argument array. If shell execution is unavoidable,
  use an allowlist of permitted values.
- **HTML/XSS:** Sanitize all user-generated content before rendering.
  Use the framework's built-in escaping (React's JSX, Django's template
  engine). If inserting raw HTML, use a sanitization library with an
  allowlist, not a denylist.

### 2. Secret exposure

**Rule:** Never check in API keys, passwords, tokens, or credentials.

- Store secrets in environment variables. Reference them via
  `process.env`, `os.environ`, or equivalent.
- Add files containing secrets to `.gitignore` immediately.
- Use `.env.example` with placeholder values, never `.env` with real
  values committed to the repo.
- **If a secret is committed by accident:**
  1. Rotate the secret immediately — assume it's compromised.
  2. Remove from git history using `git filter-branch` or BFG Repo Cleaner.
  3. Append to `.agent-room/anti-patterns.md`: what happened, how it
     slipped through, what rule prevents recurrence.
  4. Force-push the cleaned history (coordinate with the team).

### 3. Authentication and authorization

**Rule:** Validate the user session and permissions on the server side
for every request, not just in the UI.

- **Token lifecycle:** Access tokens should be short-lived (15-60
  minutes). Use refresh tokens for re-authentication. Implement token
  revocation for logout and password changes.
- **Password storage:** Use bcrypt, scrypt, or Argon2 with appropriate
  work factors. Never use MD5, SHA-1, or SHA-256 alone for password
  hashing — they're too fast.
- **Session management:** Regenerate session IDs after login. Set
  cookies with `HttpOnly`, `Secure`, and `SameSite=Strict` flags.
- **Authorization checks:** Check permissions at the data layer, not
  just the route layer. A user should not be able to access another
  user's data by guessing the resource ID (IDOR vulnerability).

### 4. Input validation and sanitization

**Rule:** Parse and validate schemas explicitly. Reject what you don't
expect rather than trying to clean what you don't understand.

- Define expected input shapes using validation libraries (Joi, Zod,
  Pydantic, serde). Reject requests that don't match the schema.
- Validate types, lengths, ranges, and formats. A "name" field that
  accepts 10MB of text is a denial-of-service vector.
- File uploads: validate MIME type (by content, not just extension),
  enforce size limits, store outside the web root, generate random
  filenames.

### 5. Dependency security

**Rule:** Audit dependencies regularly. A vulnerability in a dependency
is a vulnerability in your application.

- Run `npm audit`, `pip audit`, `cargo audit`, or equivalent as part of
  CI. Fail the build on high/critical severity findings.
- Review new dependencies before adding them: maintenance status, known
  vulnerabilities, transitive dependency count, license compatibility.
- Pin dependency versions in production. Use lockfiles (`package-lock.json`,
  `Pipfile.lock`, `Cargo.lock`) and commit them.
- **When an audit finds a vulnerability:**
  1. Check if the vulnerable code path is actually reachable in your app.
  2. If yes, update immediately. If no, document and schedule.
  3. Don't suppress audit warnings without documenting why.

### 6. Transport and configuration security

**Rule:** Enforce HTTPS. Configure security headers. Don't trust defaults.

- **CORS:** Use an explicit allowlist of permitted origins. Never use
  `Access-Control-Allow-Origin: *` with credentials. Misconfigured CORS
  is one of the most common agent-introduced security bugs.
- **CSP:** Set `Content-Security-Policy` headers. Start restrictive and
  loosen only as needed, with documentation for each exception.
- **Rate limiting:** Apply rate limits to authentication endpoints, API
  endpoints, and any resource-intensive operations.

## Red flags — stop and review

"We'll add security later" · skipping input validation because "it's an
internal API" · storing secrets in config files committed to git · using
`eval()` or `Function()` with user input · disabling HTTPS for local
convenience and forgetting to re-enable · "the frontend prevents this" as
a security justification.
