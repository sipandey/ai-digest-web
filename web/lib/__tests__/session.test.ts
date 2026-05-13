/**
 * Tests for web/lib/session.ts
 *
 * Covers the L-1 additions:
 *   - createSessionToken returns { token, jti } (not a bare string)
 *   - jti is a valid UUID v4, embedded in the payload, unique per call
 *   - verifySessionToken returns { sub, jti } for modern tokens
 *   - verifySessionToken returns { sub, jti: null } for legacy tokens (no jti)
 *   - expiry is now 30 days (reduced from 90)
 *   - cookie header helpers include the right attributes
 */

import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  buildSetCookieHeader,
  buildClearCookieHeader,
  COOKIE_NAME,
  EXPIRY_SECONDS,
} from "../session";

// ── internal helpers ──────────────────────────────────────────────────────────

/** Decode the base64url payload segment of a token → parsed JSON. */
function decodePayload(token: string): Record<string, unknown> {
  const segment = token.split(".")[0];
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * Build a validly-signed token with arbitrary payload — used for testing
 * expiry and missing-claim scenarios without going through createSessionToken.
 */
async function signPayload(payload: object): Promise<string> {
  const secret = process.env.GUEST_SESSION_SECRET!;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${Buffer.from(sig).toString("base64url")}`;
}

// ── createSessionToken ────────────────────────────────────────────────────────

describe("createSessionToken", () => {
  it("returns an object with a token string and a jti string", async () => {
    const result = await createSessionToken("user-abc");
    expect(typeof result.token).toBe("string");
    expect(typeof result.jti).toBe("string");
  });

  it("jti is a valid UUID v4", async () => {
    const { jti } = await createSessionToken("user-abc");
    expect(jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("jti is embedded in the token payload", async () => {
    const { token, jti } = await createSessionToken("user-abc");
    expect(decodePayload(token).jti).toBe(jti);
  });

  it("sub (userId) is embedded in the token payload", async () => {
    const { token } = await createSessionToken("user-xyz");
    expect(decodePayload(token).sub).toBe("user-xyz");
  });

  it("exp is set to approximately now + EXPIRY_SECONDS", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { token } = await createSessionToken("user-abc");
    const after = Math.floor(Date.now() / 1000);
    const exp = decodePayload(token).exp as number;
    expect(exp).toBeGreaterThanOrEqual(before + EXPIRY_SECONDS);
    expect(exp).toBeLessThanOrEqual(after + EXPIRY_SECONDS);
  });

  it("generates a unique jti on every call", async () => {
    const [a, b] = await Promise.all([
      createSessionToken("user"),
      createSessionToken("user"),
    ]);
    expect(a.jti).not.toBe(b.jti);
  });

  it("EXPIRY_SECONDS is 30 days (not the old 90)", () => {
    expect(EXPIRY_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});

// ── verifySessionToken ────────────────────────────────────────────────────────

describe("verifySessionToken", () => {
  it("returns { sub, jti } for a freshly minted token", async () => {
    const userId = "user-verify-001";
    const { token, jti } = await createSessionToken(userId);
    const result = await verifySessionToken(token);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe(userId);
    expect(result!.jti).toBe(jti);
  });

  it("returns null for a token with a tampered signature", async () => {
    const { token } = await createSessionToken("user");
    const parts = token.split(".");
    // Flip the last character of the signature segment
    const last = parts[1];
    parts[1] = last.slice(0, -1) + (last.endsWith("A") ? "B" : "A");
    expect(await verifySessionToken(parts.join("."))).toBeNull();
  });

  it("returns null for a token with a tampered payload", async () => {
    const { token } = await createSessionToken("user");
    const parts = token.split(".");
    // Swap in a different user id
    const badPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", exp: 9999999999 }),
    ).toString("base64url");
    parts[0] = badPayload;
    expect(await verifySessionToken(parts.join("."))).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const expired = await signPayload({
      sub: "user",
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("returns null for a token without a sub claim", async () => {
    const noSub = await signPayload({
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(await verifySessionToken(noSub)).toBeNull();
  });

  it("returns null for obviously invalid strings", async () => {
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("not-a-token")).toBeNull();
    expect(await verifySessionToken(".")).toBeNull();
  });

  it("returns { jti: null } for a legacy token that has no jti claim", async () => {
    // Old format — only sub + exp, no jti
    const legacy = await signPayload({
      sub: "legacy-user",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const result = await verifySessionToken(legacy);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe("legacy-user");
    expect(result!.jti).toBeNull();
  });

  it("accepts a non-UUID jti string (validation is caller's responsibility)", async () => {
    // The verifier only checks structural validity, not UUID format
    const token = await signPayload({
      sub: "user",
      jti: "custom-id",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const result = await verifySessionToken(token);
    expect(result?.jti).toBe("custom-id");
  });
});

// ── buildSetCookieHeader ──────────────────────────────────────────────────────

describe("buildSetCookieHeader", () => {
  it("includes the cookie name and token value", () => {
    const header = buildSetCookieHeader("my-token");
    expect(header).toContain(`${COOKIE_NAME}=my-token`);
  });

  it("includes Max-Age matching EXPIRY_SECONDS", () => {
    const header = buildSetCookieHeader("tok");
    expect(header).toContain(`Max-Age=${EXPIRY_SECONDS}`);
  });

  it("includes HttpOnly", () => {
    expect(buildSetCookieHeader("tok")).toContain("HttpOnly");
  });

  it("includes SameSite=Lax", () => {
    expect(buildSetCookieHeader("tok")).toContain("SameSite=Lax");
  });

  it("does NOT include Secure when NODE_ENV is test", () => {
    // setup.ts sets NODE_ENV=test, so the production Secure flag should be absent
    expect(buildSetCookieHeader("tok")).not.toContain("Secure");
  });
});

// ── buildClearCookieHeader ────────────────────────────────────────────────────

describe("buildClearCookieHeader", () => {
  it("sets Max-Age=0 to expire the cookie immediately", () => {
    expect(buildClearCookieHeader()).toContain("Max-Age=0");
  });

  it("includes the cookie name", () => {
    expect(buildClearCookieHeader()).toContain(`${COOKIE_NAME}=`);
  });

  it("includes HttpOnly", () => {
    expect(buildClearCookieHeader()).toContain("HttpOnly");
  });

  it("includes SameSite=Lax", () => {
    expect(buildClearCookieHeader()).toContain("SameSite=Lax");
  });

  it("does NOT include Secure when NODE_ENV is test", () => {
    expect(buildClearCookieHeader()).not.toContain("Secure");
  });
});
