/**
 * POST /api/guest/setup
 *
 * Creates or updates a Notion-first user account — no email or Clerk session
 * required.  On success sets a signed session cookie and returns the user ID.
 *
 * Steps:
 *   1. Validate Notion integration token   (GET /v1/users/me)
 *   2. Validate Notion database access     (GET /v1/databases/:id)
 *   3. Upsert users row keyed on notion_bot_id
 *   4. Upsert user_configs row
 *   5. Issue signed __digest_sid cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSessionToken, buildSetCookieHeader } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { encrypt } from "@/lib/encryption";
import { isValidNotionDatabaseId, cleanNotionDatabaseId } from "@/lib/notion";

const NOTION_VERSION = "2022-06-28";

async function notionGet(path: string, token: string) {
  return fetch(`https://api.notion.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    // 8-second timeout — Notion can be slow on first call
    signal: AbortSignal.timeout(8000),
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(`guest-setup:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a minute." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    notionToken,
    notionDatabaseId,
    topics,
    profileDescription,
    experienceLevel,
    digestHour,
    timezoneOffset,
    email,
  } = body as Record<string, unknown>;

  if (!notionToken || typeof notionToken !== "string") {
    return NextResponse.json({ error: "notionToken is required" }, { status: 400 });
  }
  if (!notionDatabaseId || typeof notionDatabaseId !== "string") {
    return NextResponse.json({ error: "notionDatabaseId is required" }, { status: 400 });
  }

  // ── 1. Validate Notion token ───────────────────────────────────────────────
  const meRes = await notionGet("/users/me", notionToken);
  if (!meRes.ok) {
    return NextResponse.json(
      { error: "Invalid Notion integration token. Check it and try again." },
      { status: 400 },
    );
  }
  const me = await meRes.json();
  const notionBotId: string = me.id;
  if (!notionBotId) {
    return NextResponse.json(
      { error: "Could not read bot ID from Notion. Is this an integration token?" },
      { status: 400 },
    );
  }

  // ── 2. Validate database access ────────────────────────────────────────────
  if (!isValidNotionDatabaseId(notionDatabaseId)) {
    return NextResponse.json(
      { error: "Invalid Notion database ID format." },
      { status: 400 },
    );
  }
  const dbId = cleanNotionDatabaseId(notionDatabaseId);
  const dbRes = await notionGet(`/databases/${dbId}`, notionToken);
  if (!dbRes.ok) {
    return NextResponse.json(
      {
        error:
          "Cannot access that Notion database. Make sure you've shared it with your integration.",
      },
      { status: 400 },
    );
  }

  // ── 3. Upsert users row ────────────────────────────────────────────────────
  const normalizedEmail =
    typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .upsert(
      {
        notion_bot_id: notionBotId,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        active: true,
      },
      { onConflict: "notion_bot_id" },
    )
    .select("id")
    .single();

  if (userError || !user) {
    console.error("guest setup — upsert user error:", JSON.stringify(userError));
    // Could be an email uniqueness conflict (email already belongs to a Clerk user)
    if (userError?.code === "23505") {
      return NextResponse.json(
        {
          error:
            "That email is already linked to an account. Sign in with email instead, or leave the email field blank.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: "Failed to create account",
        detail: userError?.message ?? "unknown db error",
      },
      { status: 500 },
    );
  }

  // ── 4. Upsert user_configs row ─────────────────────────────────────────────
  // Encrypt credentials at the application layer before persisting.
  const [encryptedToken, encryptedDatabaseId] = await Promise.all([
    encrypt(notionToken),
    encrypt(notionDatabaseId),
  ]);

  const { error: configError } = await supabaseAdmin
    .from("user_configs")
    .upsert(
      {
        user_id: user.id,
        notion_token: encryptedToken,
        notion_database_id: encryptedDatabaseId,
        notion_connected: true,
        topics: Array.isArray(topics) ? topics : [],
        profile_description:
          typeof profileDescription === "string" ? profileDescription.trim() : null,
        experience_level:
          typeof experienceLevel === "string" ? experienceLevel : "developer_learning_ai",
        digest_hour: typeof digestHour === "number" ? digestHour : 7,
        timezone_offset: typeof timezoneOffset === "number" ? timezoneOffset : 0,
        active: true,
      },
      { onConflict: "user_id" },
    );

  if (configError) {
    console.error("guest setup — upsert user_configs error:", configError);
    return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 });
  }

  // ── 5. Issue session cookie ────────────────────────────────────────────────
  const token = await createSessionToken(user.id);
  const response = NextResponse.json({ success: true, userId: user.id });
  response.headers.set("Set-Cookie", buildSetCookieHeader(token));
  return response;
}
