/**
 * POST /api/auth/logout
 *
 * Clears the __digest_sid session cookie for Notion-first (guest) users.
 * Clerk users sign out via useClerk().signOut() on the client — this route
 * is only needed for guests who have no Clerk session to invalidate.
 */

import { NextResponse } from "next/server";
import { buildClearCookieHeader } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", buildClearCookieHeader());
  return response;
}
