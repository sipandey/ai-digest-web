/**
 * POST /api/auth/logout
 *
 * Clears the __digest_sid session cookie for Notion-first (guest) users.
 * Clerk users sign out via useClerk().signOut() on the client — this route
 * is only needed for guests who have no Clerk session to invalidate.
 *
 * Also soft-revokes the session in the guest_sessions table so the token
 * is rejected on every future API call, even if it somehow survives cookie
 * removal (e.g. a copy made before logout).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, buildClearCookieHeader, COOKIE_NAME } from "@/lib/session";
import { revokeGuestSession } from "@/lib/guest-sessions";

export async function POST(req: NextRequest) {
  // Extract jti from the current cookie (if present) and revoke it.
  // We do this best-effort — a missing or unverifiable token still clears the
  // cookie; we just can't do a DB revocation in that case.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  if (match) {
    const token = decodeURIComponent(match[1]);
    try {
      const payload = await verifySessionToken(token);
      if (payload?.jti) {
        await revokeGuestSession(payload.jti);
      }
    } catch {
      // Verification failure is fine — we still clear the cookie below.
    }
  }

  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", buildClearCookieHeader());
  return response;
}
