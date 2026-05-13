/**
 * Tests for web/lib/guest-sessions.ts
 *
 * Covers the L-1 additions:
 *   persistGuestSession  — inserts the right row, fails open on DB error
 *   revokeGuestSession   — soft-deletes by setting revoked_at, fails open
 *   isGuestSessionValid  — returns true/false based on DB row, handles legacy
 *                          jti=null, fails open on DB error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock (vi.hoisted ensures it's available inside vi.mock) ──────────
//
// The Supabase client uses a fluent builder pattern:
//   supabaseAdmin.from("t").insert({...})
//   supabaseAdmin.from("t").update({...}).eq(...).is(...)
//   supabaseAdmin.from("t").select(...).eq(...).is(...).gt(...).maybeSingle()
//
// We model this with a shared chain object.  Methods that are used as
// intermediate steps return the chain itself; terminal methods return Promises.
// For revokeGuestSession, `.is()` is terminal — tests configure it per-case.

const { mockFrom, chain } = vi.hoisted(() => {
  const c = {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>;

  const mockFrom = vi.fn().mockReturnValue(c);
  return { mockFrom, chain: c };
});

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

// ── imports (after mocks are hoisted) ─────────────────────────────────────────

import {
  persistGuestSession,
  revokeGuestSession,
  isGuestSessionValid,
} from "../guest-sessions";

// ── shared test setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue(chain);

  // Default: intermediate methods return the chain for chaining
  chain.update.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);

  // Default for is(): return chain (chaining). Individual tests override
  // this to a Promise for the revokeGuestSession terminal case.
  chain.is.mockReturnValue(chain);

  // Default terminal results
  chain.insert.mockResolvedValue({ error: null });
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
});

// ── persistGuestSession ───────────────────────────────────────────────────────

describe("persistGuestSession", () => {
  it("calls from('guest_sessions').insert() with jti, user_id, and expires_at", async () => {
    const jti = crypto.randomUUID();
    await persistGuestSession(jti, "user-123");

    expect(mockFrom).toHaveBeenCalledWith("guest_sessions");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        jti,
        user_id: "user-123",
        expires_at: expect.any(String),
      }),
    );
  });

  it("expires_at is approximately now + 30 days (EXPIRY_SECONDS)", async () => {
    const jti = crypto.randomUUID();
    await persistGuestSession(jti, "user-123");

    const insertArg = chain.insert.mock.calls[0][0] as { expires_at: string };
    const expiresAt = new Date(insertArg.expires_at).getTime();
    const expected = Date.now() + 30 * 24 * 60 * 60 * 1000;
    // Allow ±5 s of clock drift
    expect(Math.abs(expiresAt - expected)).toBeLessThan(5_000);
  });

  it("does NOT throw when the DB insert fails (fail gracefully)", async () => {
    chain.insert.mockResolvedValue({ error: new Error("unique violation") });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      persistGuestSession(crypto.randomUUID(), "user"),
    ).resolves.not.toThrow();
    spy.mockRestore();
  });

  it("logs a console.error with the prefix 'persistGuestSession' on DB failure", async () => {
    const dbError = new Error("DB error");
    chain.insert.mockResolvedValue({ error: dbError });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await persistGuestSession(crypto.randomUUID(), "user");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("persistGuestSession"),
      dbError,
    );
    spy.mockRestore();
  });
});

// ── revokeGuestSession ────────────────────────────────────────────────────────

describe("revokeGuestSession", () => {
  // For these tests, .is() must terminate the chain with a Promise so
  // `await supabaseAdmin.from(...).update(...).eq(...).is(...)` resolves.
  beforeEach(() => {
    chain.is.mockResolvedValue({ error: null });
  });

  it("calls update() with a revoked_at timestamp", async () => {
    await revokeGuestSession("some-jti");
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: expect.any(String) }),
    );
  });

  it("filters by the correct jti via .eq('jti', jti)", async () => {
    await revokeGuestSession("target-jti");
    expect(chain.eq).toHaveBeenCalledWith("jti", "target-jti");
  });

  it("only revokes active sessions via .is('revoked_at', null)", async () => {
    await revokeGuestSession("some-jti");
    expect(chain.is).toHaveBeenCalledWith("revoked_at", null);
  });

  it("does NOT throw when the DB update fails (fail gracefully)", async () => {
    chain.is.mockResolvedValue({ error: new Error("DB error") });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(revokeGuestSession("jti")).resolves.not.toThrow();
    spy.mockRestore();
  });

  it("logs a console.error with the prefix 'revokeGuestSession' on DB failure", async () => {
    const dbError = new Error("DB error");
    chain.is.mockResolvedValue({ error: dbError });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await revokeGuestSession("jti");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("revokeGuestSession"),
      dbError,
    );
    spy.mockRestore();
  });
});

// ── isGuestSessionValid ───────────────────────────────────────────────────────

describe("isGuestSessionValid", () => {
  it("returns true immediately for null jti (legacy token) without touching the DB", async () => {
    const result = await isGuestSessionValid(null);
    expect(result).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns true when the session row exists and is not revoked", async () => {
    chain.maybeSingle.mockResolvedValue({ data: { jti: "active-jti" }, error: null });
    expect(await isGuestSessionValid("active-jti")).toBe(true);
  });

  it("returns false when no matching non-revoked row is found", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await isGuestSessionValid("revoked-or-missing-jti")).toBe(false);
  });

  it("queries the correct table", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    await isGuestSessionValid("test-jti");
    expect(mockFrom).toHaveBeenCalledWith("guest_sessions");
  });

  it("filters for non-revoked rows: .is('revoked_at', null)", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    await isGuestSessionValid("test-jti");
    expect(chain.is).toHaveBeenCalledWith("revoked_at", null);
  });

  it("filters for non-expired rows: .gt('expires_at', <ISO string>)", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    await isGuestSessionValid("test-jti");
    expect(chain.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("looks up by jti: .eq('jti', jti)", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    await isGuestSessionValid("lookup-jti");
    expect(chain.eq).toHaveBeenCalledWith("jti", "lookup-jti");
  });

  it("returns true on a DB error (fail open — do not log out the user)", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: new Error("DB timeout") });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await isGuestSessionValid("some-jti")).toBe(true);
    spy.mockRestore();
  });

  it("logs a console.error with 'isGuestSessionValid' on DB failure", async () => {
    const dbError = new Error("connection refused");
    chain.maybeSingle.mockResolvedValue({ data: null, error: dbError });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await isGuestSessionValid("some-jti");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("isGuestSessionValid"),
      dbError,
    );
    spy.mockRestore();
  });
});
