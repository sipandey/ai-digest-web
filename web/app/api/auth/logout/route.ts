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
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );

  // ── CSRF guard ──────────────────────────────────────────────────────────────
  // Require the session cookie to be present before doing anything.
  //
  // Why: SameSite=Lax already prevents cross-site POSTs from including the
  // cookie, so an absent cookie is a reliable signal of either:
  //   (a) a CSRF attempt from a different origin, or
  //   (b) a caller with no active guest session.
  //
  // In both cases there is nothing to revoke and no cookie to clear — returning
  // 401 here is defence-in-depth on top of the proxy middleware redirect and
  // the SameSite constraint.  The attacker cannot reach the "success" branch
  // without already having the victim's cookie.
  if (!match) {
    return NextResponse.json(
      { error: "No active guest session to sign out of" },
      { status: 401 },
    );
  }

  // Cookie present — attempt to extract jti and revoke the session server-side.
  // This is best-effort: a tampered or expired token still gets its cookie
  // cleared so the user's browser is cleaned up.
  const token = decodeURIComponent(match[1]);
  try {
    const payload = await verifySessionToken(token);
    if (payload?.jti) {
      await revokeGuestSession(payload.jti);
    }
  } catch {
    // Verification failure is fine — we still clear the cookie below.
  }

  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", buildClearCookieHeader());
  return response;
}
