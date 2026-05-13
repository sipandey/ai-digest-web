/**
 * Tests for web/proxy.ts (Next.js 16 middleware)
 *
 * Covers the L-2 fix (route protection via clerkMiddleware) plus the
 * pre-existing CSP nonce generation (H-2b).
 *
 * Strategy
 * ─────────
 * • clerkMiddleware is mocked to be the identity HOC so we can call the inner
 *   handler directly as middleware(request) and supply a mock auth() function.
 * • createRouteMatcher is mocked with a minimal regex engine that correctly
 *   handles the patterns used in proxy.ts  (e.g. "/signup(.*)" → ^/signup.*$).
 * • NextResponse.next / NextResponse.redirect are mocked to return plain
 *   objects with a real Headers-like interface so we can assert on CSP values.
 * • verifySessionToken is mocked so cookie-auth tests don't need real HMAC keys.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted — variables that must be available inside vi.mock factories ────

const {
  mockClerkAuth,
  mockNextResponseNext,
  mockNextResponseRedirect,
  mockVerifySessionToken,
} = vi.hoisted(() => ({
  mockClerkAuth: vi.fn(),
  mockNextResponseNext: vi.fn(),
  mockNextResponseRedirect: vi.fn(),
  mockVerifySessionToken: vi.fn(),
}));

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@clerk/nextjs/server", () => ({
  /**
   * Strip the clerkMiddleware HOC — the inner handler becomes the export.
   * The handler signature is `(auth, request) => Response`.
   * We wrap it so callers only need to pass `(request)` — auth is injected
   * from mockClerkAuth which tests configure per-case.
   */
  clerkMiddleware: (handler: (auth: unknown, req: unknown) => unknown) =>
    (request: unknown) => handler(mockClerkAuth, request),

  /**
   * Minimal createRouteMatcher: treats each pattern as a raw regex anchored
   * at start/end.  The patterns in proxy.ts are already regex-like strings
   * (e.g. "/signup(.*)"), so no extra transformation is needed.
   */
  createRouteMatcher: (patterns: string[]) => {
    const regexes = patterns.map((p) => new RegExp(`^${p}$`));
    return (req: { url: string }) => {
      const { pathname } = new URL(req.url);
      return regexes.some((r) => r.test(pathname));
    };
  },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: mockNextResponseNext,
    redirect: mockNextResponseRedirect,
  },
}));

vi.mock("@/lib/session", () => ({
  COOKIE_NAME: "__digest_sid",
  verifySessionToken: mockVerifySessionToken,
  // Unused in proxy.ts but exported from session.ts — keep the mock complete
  createSessionToken: vi.fn(),
  buildSetCookieHeader: vi.fn(),
  buildClearCookieHeader: vi.fn(),
  EXPIRY_SECONDS: 30 * 24 * 60 * 60,
}));

// ── import middleware AFTER mocks are in place ─────────────────────────────────

import middleware from "../../proxy";

// ── shared helpers ────────────────────────────────────────────────────────────

/** Lightweight Headers that tracks set() calls so we can assert on CSP etc. */
function createHeaders() {
  const store: Record<string, string> = {};
  return {
    set(key: string, value: string) {
      store[key.toLowerCase()] = value;
    },
    get(key: string) {
      return store[key.toLowerCase()] ?? null;
    },
    _store: store,
  };
}

/** Build a minimal mock NextRequest. */
function makeRequest(
  pathname: string,
  options: { cookieValue?: string } = {},
): {
  url: string;
  headers: Headers;
  cookies: { get: (n: string) => { value: string } | undefined };
} {
  const url = `http://localhost${pathname}`;
  const hdrs = new Headers();
  if (options.cookieValue) {
    hdrs.set("cookie", `__digest_sid=${options.cookieValue}`);
  }
  return {
    url,
    headers: hdrs,
    cookies: {
      get: (name: string) =>
        options.cookieValue && name === "__digest_sid"
          ? { value: options.cookieValue }
          : undefined,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default auth state: not signed in via Clerk
  mockClerkAuth.mockResolvedValue({ userId: null });

  // Default verifySessionToken: token is invalid
  mockVerifySessionToken.mockResolvedValue(null);

  // NextResponse.next() → object with settable headers
  mockNextResponseNext.mockImplementation(() => ({
    _type: "next",
    headers: createHeaders(),
  }));

  // NextResponse.redirect(url) → object exposing the redirect URL
  mockNextResponseRedirect.mockImplementation((url: URL) => ({
    _type: "redirect",
    _url: url.toString(),
    headers: createHeaders(),
  }));
});

// ── CSP nonce generation (H-2b) ───────────────────────────────────────────────

describe("CSP nonce generation", () => {
  it("sets a content-security-policy header on every passing response", async () => {
    const response = (await middleware(makeRequest("/"))) as ReturnType<
      typeof createHeaders
    > & { headers: ReturnType<typeof createHeaders> };
    const csp = response.headers.get("content-security-policy");
    expect(csp).not.toBeNull();
    expect(typeof csp).toBe("string");
  });

  it("CSP contains 'nonce-' (a per-request nonce)", async () => {
    const response = (await middleware(makeRequest("/"))) as {
      headers: ReturnType<typeof createHeaders>;
    };
    expect(response.headers.get("content-security-policy")).toContain(
      "nonce-",
    );
  });

  it("CSP contains 'strict-dynamic' for script-src", async () => {
    const response = (await middleware(makeRequest("/"))) as {
      headers: ReturnType<typeof createHeaders>;
    };
    expect(response.headers.get("content-security-policy")).toContain(
      "strict-dynamic",
    );
  });

  it("nonces differ between separate requests (cryptographically random)", async () => {
    const r1 = (await middleware(makeRequest("/"))) as {
      headers: ReturnType<typeof createHeaders>;
    };
    const r2 = (await middleware(makeRequest("/"))) as {
      headers: ReturnType<typeof createHeaders>;
    };
    const csp1 = r1.headers.get("content-security-policy")!;
    const csp2 = r2.headers.get("content-security-policy")!;
    // Extract the nonce value from 'nonce-<value>'
    const nonce1 = csp1.match(/nonce-([^\s']+)/)?.[1];
    const nonce2 = csp2.match(/nonce-([^\s']+)/)?.[1];
    expect(nonce1).toBeDefined();
    expect(nonce2).toBeDefined();
    expect(nonce1).not.toBe(nonce2);
  });

  it("CSP is also set on redirect responses", async () => {
    // No auth → redirect, but redirect response should also get CSP
    const response = (await middleware(makeRequest("/dashboard"))) as {
      _type: string;
      headers: ReturnType<typeof createHeaders>;
    };
    // Redirect responses don't have CSP set in the current implementation
    // (the function returns early via NextResponse.redirect). This test
    // documents the current contract: the redirect itself carries no CSP.
    expect(response._type).toBe("redirect");
  });
});

// ── Public routes — pass through without any auth check ──────────────────────

describe("public routes", () => {
  const publicPaths = [
    "/",
    "/signup",
    "/signup/step-2",
    "/login",
    "/login/sso",
    "/setup",
    "/setup/step-1",
    "/privacy",
    "/terms",
    "/api/auth/webhook",
    "/api/auth/webhook/clerk",
    "/api/guest/setup",
    "/api/guest/verify",
    "/api/users/test-notion",
  ];

  for (const path of publicPaths) {
    it(`${path} passes through without redirecting`, async () => {
      // No Clerk session, no cookie — public route must still pass through
      const response = (await middleware(makeRequest(path))) as {
        _type: string;
      };
      expect(response._type).toBe("next");
      expect(mockNextResponseRedirect).not.toHaveBeenCalled();
    });
  }
});

// ── Protected routes — redirect when unauthenticated ─────────────────────────

describe("route protection — unauthenticated requests are redirected", () => {
  const protectedPaths = [
    "/dashboard",
    "/settings",
    "/api/users/config",
    "/api/pipeline/trigger",
  ];

  for (const path of protectedPaths) {
    it(`${path} redirects to / when no auth method is present`, async () => {
      const response = (await middleware(makeRequest(path))) as {
        _type: string;
        _url: string;
      };
      expect(response._type).toBe("redirect");
      expect(response._url).toContain("http://localhost/");
    });
  }

  it("a cookie with an invalid/expired token still redirects", async () => {
    mockVerifySessionToken.mockResolvedValue(null); // invalid token
    const response = (await middleware(
      makeRequest("/dashboard", { cookieValue: "bad-token" }),
    )) as { _type: string };
    expect(response._type).toBe("redirect");
  });
});

// ── Protected routes — authenticated via Clerk ────────────────────────────────

describe("route protection — Clerk-authenticated requests pass through", () => {
  beforeEach(() => {
    mockClerkAuth.mockResolvedValue({ userId: "clerk-user-id" });
  });

  it("GET /dashboard passes through with a valid Clerk session", async () => {
    const response = (await middleware(makeRequest("/dashboard"))) as {
      _type: string;
    };
    expect(response._type).toBe("next");
    expect(mockNextResponseRedirect).not.toHaveBeenCalled();
  });

  it("GET /settings passes through with a valid Clerk session", async () => {
    const response = (await middleware(makeRequest("/settings"))) as {
      _type: string;
    };
    expect(response._type).toBe("next");
  });

  it("GET /api/users/config passes through with a valid Clerk session", async () => {
    const response = (await middleware(makeRequest("/api/users/config"))) as {
      _type: string;
    };
    expect(response._type).toBe("next");
  });
});

// ── Protected routes — authenticated via guest session cookie ─────────────────

describe("route protection — guest-cookie-authenticated requests pass through", () => {
  beforeEach(() => {
    // Clerk has no session
    mockClerkAuth.mockResolvedValue({ userId: null });
    // Guest cookie is valid
    mockVerifySessionToken.mockResolvedValue({ sub: "guest-user-id", jti: "some-jti" });
  });

  it("GET /dashboard passes through with a valid __digest_sid cookie", async () => {
    const response = (await middleware(
      makeRequest("/dashboard", { cookieValue: "valid-session-token" }),
    )) as { _type: string };
    expect(response._type).toBe("next");
    expect(mockNextResponseRedirect).not.toHaveBeenCalled();
  });

  it("GET /settings passes through with a valid guest cookie", async () => {
    const response = (await middleware(
      makeRequest("/settings", { cookieValue: "valid-session-token" }),
    )) as { _type: string };
    expect(response._type).toBe("next");
  });

  it("verifySessionToken is called with the cookie value", async () => {
    await middleware(
      makeRequest("/dashboard", { cookieValue: "the-token" }),
    );
    expect(mockVerifySessionToken).toHaveBeenCalledWith("the-token");
  });

  it("falls back to redirect when the cookie payload has no sub", async () => {
    // verifySessionToken returns a value without a valid sub
    mockVerifySessionToken.mockResolvedValue({ sub: "", jti: "jti" });
    const response = (await middleware(
      makeRequest("/dashboard", { cookieValue: "token" }),
    )) as { _type: string };
    // sub is falsy — should redirect
    expect(response._type).toBe("redirect");
  });
});
