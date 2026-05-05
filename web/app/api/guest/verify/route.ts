/**
 * POST /api/guest/verify
 *
 * Re-issues a session cookie for a returning Notion-first user who has lost
 * their session (e.g. cleared browser cookies, different device).
 *
 * The Notion integration token proves ownership — we look up the account by
 * notion_bot_id and issue a fresh cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSessionToken, buildSetCookieHeader } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";

const NOTION_VERSION = "2022-06-28";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = rateLimit(`guest-verify:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a minute." },
      { status: 429 },
    );
  }

  let body: { notionToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { notionToken } = body;
  if (!notionToken?.trim()) {
    return NextResponse.json({ error: "notionToken is required" }, { status: 400 });
  }

  // ── Validate token with Notion ─────────────────────────────────────────────
  let notionBotId: string;
  try {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Invalid Notion token. Check it and try again." },
        { status: 400 },
      );
    }
    const me = await res.json();
    notionBotId = me.id;
  } catch {
    return NextResponse.json(
      { error: "Could not reach Notion. Check your connection and try again." },
      { status: 502 },
    );
  }

  // ── Look up user ───────────────────────────────────────────────────────────
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("notion_bot_id", notionBotId)
    .maybeSingle();

  if (error || !user) {
    return NextResponse.json(
      {
        error:
          "No account found for this Notion integration. Did you set up with a different token?",
      },
      { status: 404 },
    );
  }

  // ── Issue fresh cookie ─────────────────────────────────────────────────────
  const token = await createSessionToken(user.id);
  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", buildSetCookieHeader(token));
  return response;
}
