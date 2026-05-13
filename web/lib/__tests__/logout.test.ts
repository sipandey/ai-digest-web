/**
 * Tests for web/app/api/auth/logout/route.ts
 *
 * Covers the L-5 fix (CSRF protection on the logout endpoint):
 *   - Requests with NO __digest_sid cookie → 401 (CSRF guard)
 *   - Requests WITH a cookie → 200, Set-Cookie clear header applied
 *   - Valid token with jti → revokeGuestSession called
 *   - Invalid / expired token → still clears cookie (best-effort), no revocation
 *   - Legacy token (jti: null) → clears cookie, no revocation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockVerifySessionToken,
  mockRevokeGuestSession,
  mockBuildClearCookieHeader,
} = vi.hoisted(() => ({
  mockVerifySessionToken: vi.fn(),
  mockRevokeGuestSession: vi.fn().mockResolvedValue(undefined),
  mockBuildClearCookieHeader: vi
    .fn()
    .mockReturnValue(
      "__digest_sid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    ),
}));

vi.mock("@/lib/session", () => ({
  COOKIE_NAME: "__digest_sid",
  verifySessionToken: mockVerifySessionToken,
  buildClearCookieHeader: mockBuildClearCookieHeader,
}));

vi.mock("@/lib/guest-sessions", () => ({
  revokeGuestSession: mockRevokeGuestSession,
}));

// Use a real but minimal NextResponse mock: real Response-shaped objects with
// settable headers so we can assert on Set-Cookie without importing Next.js.
vi.mock("next/server", () => {
  const makeHeaders = () => {
    const store: Record<string, string> = {};
    return {
      set(k: string, v: string) {
        store[k.toLowerCase()] = v;
      },
      get(k: string) {
        return store[k.toLowerCase()] ?? null;
      },
      _store: store,
    };
  };
  return {
    NextResponse: {
      json(body: unknown, init?: { status?: number }) {
        const headers = makeHeaders();
        return {
          status: init?.status ?? 200,
          headers,
          async json() {
            return body;
          },
          _body: body,
        };
      },
    },
  };
});

// ── import route handler AFTER mocks ─────────────────────────────────────────

import { POST } from "../../app/api/auth/logout/route";

// ── helpers ───────────────────────────────────────────────────────────────────

type MockResponse = {
  status: number;
  headers: { get(k: string): string | null; _store: Record<string, string> };
  json(): Promise<unknown>;
  _body: unknown;
};

/** Build a minimal request object — the handler only reads headers.get("cookie"). */
function makeRequest(cookieValue?: string): { headers: Headers } {
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `__digest_sid=${encodeURIComponent(cookieValue)}`);
  }
  return { headers } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRevokeGuestSession.mockResolvedValue(undefined);
  mockBuildClearCookieHeader.mockReturnValue(
    "__digest_sid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
  );
  // Default: token is valid, has a jti
  mockVerifySessionToken.mockResolvedValue({
    sub: "user-123",
    jti: "some-jti-uuid",
  });
});

// ── CSRF guard — no cookie present ───────────────────────────────────────────

describe("CSRF guard: no __digest_sid cookie", () => {
  it("returns 401 when no cookie is present", async () => {
    const res = (await POST(makeRequest())) as MockResponse;
    expect(res.status).toBe(401);
  });

  it("response body contains an error message", async () => {
    const res = (await POST(makeRequest())) as MockResponse;
    const body = (await res.json()) as { error?: string };
    expect(typeof body.error).toBe("string");
    expect(body.error!.length).toBeGreaterThan(0);
  });

  it("does NOT call revokeGuestSession", async () => {
    await POST(makeRequest());
    expect(mockRevokeGuestSession).not.toHaveBeenCalled();
  });

  it("does NOT set a Set-Cookie header (nothing to clear)", async () => {
    const res = (await POST(makeRequest())) as MockResponse;
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does NOT call verifySessionToken", async () => {
    await POST(makeRequest());
    expect(mockVerifySessionToken).not.toHaveBeenCalled();
  });
});

// ── Normal logout — cookie present, valid token with jti ─────────────────────

describe("normal logout: cookie present with valid jti token", () => {
  beforeEach(() => {
    mockVerifySessionToken.mockResolvedValue({
      sub: "user-123",
      jti: "valid-jti-uuid",
    });
  });

  it("returns 200", async () => {
    const res = (await POST(makeRequest("a-valid-token"))) as MockResponse;
    expect(res.status).toBe(200);
  });

  it("response body indicates success", async () => {
    const res = (await POST(makeRequest("a-valid-token"))) as MockResponse;
    const body = (await res.json()) as { success?: boolean };
    expect(body.success).toBe(true);
  });

  it("sets the Set-Cookie clear header", async () => {
    const res = (await POST(makeRequest("a-valid-token"))) as MockResponse;
    expect(res.headers.get("set-cookie")).not.toBeNull();
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("calls revokeGuestSession with the jti from the token payload", async () => {
    await POST(makeRequest("a-valid-token"));
    expect(mockRevokeGuestSession).toHaveBeenCalledWith("valid-jti-uuid");
    expect(mockRevokeGuestSession).toHaveBeenCalledTimes(1);
  });

  it("passes the raw token value to verifySessionToken", async () => {
    await POST(makeRequest("the-raw-token"));
    expect(mockVerifySessionToken).toHaveBeenCalledWith("the-raw-token");
  });
});

// ── Logout with invalid / expired token ──────────────────────────────────────

describe("logout with invalid or expired cookie token", () => {
  beforeEach(() => {
    mockVerifySessionToken.mockResolvedValue(null); // invalid / expired
  });

  it("still returns 200 (best-effort — clear the cookie regardless)", async () => {
    const res = (await POST(makeRequest("expired-token"))) as MockResponse;
    expect(res.status).toBe(200);
  });

  it("still sets the Set-Cookie clear header", async () => {
    const res = (await POST(makeRequest("expired-token"))) as MockResponse;
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does NOT call revokeGuestSession (no valid jti to revoke)", async () => {
    await POST(makeRequest("expired-token"));
    expect(mockRevokeGuestSession).not.toHaveBeenCalled();
  });
});

// ── Logout with legacy token (no jti claim) ───────────────────────────────────

describe("logout with a legacy token that has no jti (pre-revocation)", () => {
  beforeEach(() => {
    mockVerifySessionToken.mockResolvedValue({ sub: "user-123", jti: null });
  });

  it("returns 200", async () => {
    const res = (await POST(makeRequest("legacy-token"))) as MockResponse;
    expect(res.status).toBe(200);
  });

  it("sets the Set-Cookie clear header", async () => {
    const res = (await POST(makeRequest("legacy-token"))) as MockResponse;
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does NOT call revokeGuestSession (no jti to key on)", async () => {
    await POST(makeRequest("legacy-token"));
    expect(mockRevokeGuestSession).not.toHaveBeenCalled();
  });
});

// ── Logout when verifySessionToken throws ────────────────────────────────────

describe("logout when verifySessionToken throws unexpectedly", () => {
  beforeEach(() => {
    mockVerifySessionToken.mockRejectedValue(new Error("unexpected error"));
  });

  it("still returns 200 (exception is swallowed)", async () => {
    const res = (await POST(makeRequest("some-token"))) as MockResponse;
    expect(res.status).toBe(200);
  });

  it("still clears the cookie despite the error", async () => {
    const res = (await POST(makeRequest("some-token"))) as MockResponse;
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does NOT call revokeGuestSession", async () => {
    await POST(makeRequest("some-token"));
    expect(mockRevokeGuestSession).not.toHaveBeenCalled();
  });
});
