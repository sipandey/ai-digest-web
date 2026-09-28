---
name: integration-testing
description: "Use when implementing integration, API, or database-driven tests, or when deciding the right test type for a cross-boundary behavior."
---

# Integration Testing

## Overview

Integration tests verify that components work together correctly across
real boundaries — HTTP, databases, message queues, file systems. They
answer: "do these pieces actually connect?" Unit tests can't answer that
question because they mock the boundaries away.

## The iron law

```
NO CROSS-BOUNDARY BEHAVIOR SHIPS WITHOUT AN INTEGRATION TEST
```

If two components talk to each other and you only have unit tests,
you've tested that each component works alone — not that they work
together. That's where production bugs live.

## The test pyramid — when to use what

```
         /  E2E  \        Few, slow, expensive, high confidence
        /----------\
       / Integration \    Moderate count, real boundaries, focused
      /----------------\
     /    Unit Tests     \  Many, fast, isolated, one behavior each
    /--------------------\
```

- **Unit tests:** One function, one behavior, no I/O. Fast. Write many.
- **Integration tests:** Real database, real HTTP, real file system. Test
  the boundary, not the business logic behind it. Write enough to cover
  every boundary.
- **E2E tests:** Full user flow through the running application. Write
  sparingly — they're slow and brittle.

**Default rule:** if the behavior crosses a process, network, or storage
boundary, it needs an integration test. If it doesn't, a unit test is
sufficient.

## Core principles

### 1. Isolated state

Each test runs against a clean state. Techniques:

- **Database:** Use transactions that roll back after each test, or
  truncate tables in `beforeEach`. Never rely on insertion order from
  a previous test.
- **File system:** Use a temporary directory created in `beforeEach`,
  removed in `afterEach`.
- **External services:** Use dedicated test instances or containers,
  never shared staging environments.

### 2. Real over mocks

Use actual databases (Docker containers, SQLite in-memory, test
instances) and real file systems where possible. Mock only what you
cannot control:

- **Mock:** Third-party APIs with rate limits, payment gateways, email
  services.
- **Don't mock:** Your own database, your own file system, your own
  message queue. If you mock your own infrastructure, you're testing
  your assumptions about it, not the infrastructure itself.

### 3. No flakiness

Flaky tests are worse than no tests — they train the team to ignore
failures.

- **Never use** `sleep(N)` or arbitrary timeouts. Use wait-for-condition,
  polling with backoff, or event listeners.
- **Network tests:** Use retry with assertion (poll until the expected
  state appears, with a hard timeout that fails explicitly).
- **Ordering:** Tests must not depend on execution order. If test B
  fails only when test A runs first, the tests share state — fix the
  isolation.

### Investigating flaky tests

When a test flakes:

1. **Don't "just retry."** Retrying masks the problem.
2. **Reproduce locally** — run the test 50 times in a loop. If it passes
   every time locally, the flakiness is environmental (timing, resources,
   network).
3. **Check for shared state** — is another test leaving data behind?
4. **Check for timing assumptions** — is the test assuming an operation
   completes within a specific time?
5. **If genuinely non-deterministic** (rare), add deterministic assertions
   with explicit timeouts and document why in a comment.

## Contract testing for API boundaries

When your service calls another service (or is called by one), unit tests
and integration tests aren't enough. Contract tests verify that the
**interface** between services stays compatible:

- **Consumer-driven contracts:** The consumer defines what it expects
  (request shape, response shape). The provider runs the contract as a
  test. If the provider changes break the contract, the test fails before
  deployment.
- **Use when:** You own both sides of an API, or when a third-party API
  has a versioning scheme you need to track.

## Coverage guidance

- **Don't chase 100% integration test coverage.** Integration tests are
  expensive to run. Cover every boundary, every error path at the
  boundary (timeouts, connection failures, malformed responses), and the
  critical happy path.
- **Meaningful coverage:** "Every database query is exercised against a
  real database" is a better target than "95% line coverage."
- **Unmockable code is a smell:** If you can't test a component without
  mocking 6 dependencies, the component has too many responsibilities.
  Refactor before adding more tests.

## Commands

* Run integration tests: `npm test`
