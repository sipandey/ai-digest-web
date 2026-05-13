/**
 * Global test environment bootstrap.
 * Runs once before every test module via vitest.config.ts → setupFiles.
 */

// session.ts requires GUEST_SESSION_SECRET to import successfully — the
// importKey() function reads it at call time, but top-level module code
// references process.env so we set it before any test file loads the module.
process.env.GUEST_SESSION_SECRET =
  "vitest-test-secret-32-chars-minimum-ok!!";

// Ensure the cookie Secure flag is NOT applied in tests (NODE_ENV=test means
// the production branch inside buildSetCookieHeader is not taken).
process.env.NODE_ENV = "test";
