/**
 * Signed session tokens for Notion-first (guest) users.
 *
 * Uses the Web Crypto HMAC-SHA256 API — available in Node.js 18+ and the
 * Next.js Edge runtime with no additional dependencies.
 *
 * Token format:  base64url(payload) + "." + base64url(signature)
 * Payload:       { sub: userId, exp: unixTimestamp }
 */

export const COOKIE_NAME = "__digest_sid";
export const EXPIRY_SECONDS = 90 * 24 * 60 * 60; // 90 days

// ── internal helpers ──────────────────────────────────────────────────────────

async function importKey(): Promise<CryptoKey> {
  const raw = process.env.GUEST_SESSION_SECRET;
  if (!raw) throw new Error("GUEST_SESSION_SECRET env var is not set");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(raw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64urlEncode(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  return Buffer.from(bytes).toString("base64url");
}

function b64urlDecode(s: string): Uint8Array {
  // Buffer.from().buffer is typed as ArrayBufferLike (includes SharedArrayBuffer).
  // crypto.subtle APIs require a plain ArrayBuffer, so copy into a fresh Uint8Array
  // backed by a new ArrayBuffer that TypeScript can verify is not shared.
  const buf = Buffer.from(s, "base64url");
  const out = new Uint8Array(buf.length);
  out.set(buf);
  return out;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Create a signed session token for the given internal user UUID. */
export async function createSessionToken(userId: string): Promise<string> {
  const payload = b64urlEncode(
    JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + EXPIRY_SECONDS }),
  );
  const key = await importKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}

/** Verify a session token. Returns `{ sub: userId }` or `null` if invalid/expired. */
export async function verifySessionToken(
  token: string,
): Promise<{ sub: string } | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;

    const payload = token.slice(0, dot);
    const sigBytes = b64urlDecode(token.slice(dot + 1));

    const key = await importKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;

    const parsed = JSON.parse(Buffer.from(b64urlDecode(payload)).toString());
    if (typeof parsed.sub !== "string") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;

    return { sub: parsed.sub };
  } catch {
    return null;
  }
}

/** Build the Set-Cookie header string for a new session. */
export function buildSetCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  return [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${EXPIRY_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Build the Set-Cookie header that clears the session. */
export function buildClearCookieHeader(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}
