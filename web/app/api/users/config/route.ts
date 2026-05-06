import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthUserId, resolveUserById } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/encryption";

// ── Notion validation helper (mirrors /api/guest/setup) ──────────────────────

const NOTION_VERSION = "2022-06-28";

async function validateNotionCredentials(
  token: string,
  databaseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    };
    const signal = AbortSignal.timeout(8000);

    const meRes = await fetch("https://api.notion.com/v1/users/me", { headers, signal });
    if (!meRes.ok) {
      return { ok: false, error: "Invalid integration token — check your Notion integration secret." };
    }

    const cleanId = databaseId.replace(/-/g, "");
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${cleanId}`, { headers, signal });
    if (dbRes.status === 404) {
      return { ok: false, error: "Database not found — make sure you shared it with your integration." };
    }
    if (!dbRes.ok) {
      return { ok: false, error: "Cannot access that Notion database. Check your credentials." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach Notion — please try again." };
  }
}

// ── shared helpers ────────────────────────────────────────────────────────────

async function saveUserConfig(userId: string, values: Record<string, unknown>) {
  return supabaseAdmin
    .from("user_configs")
    .upsert({ user_id: userId, ...values }, { onConflict: "user_id" })
    .select()
    .single();
}

/**
 * Prepare a user_configs row for sending to the client:
 *   1. Strip notion_token — it is a write-capable Notion secret and must never
 *      appear in API responses (visible in browser DevTools / network logs).
 *   2. Decrypt notion_database_id so the Settings UI can display the connected
 *      database ID in plaintext.
 *
 * All other fields are returned as-is.
 */
async function prepareConfigForResponse(
  config: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  if (!config) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { notion_token, notion_database_id, ...rest } = config;

  let dbId: string | undefined;
  if (typeof notion_database_id === "string" && notion_database_id) {
    try {
      dbId = await decrypt(notion_database_id);
    } catch {
      // Decryption failure — omit rather than expose ciphertext
      dbId = undefined;
    }
  }

  return {
    ...rest,
    ...(dbId !== undefined ? { notion_database_id: dbId } : {}),
  };
}

// ── GET /api/users/config ─────────────────────────────────────────────────────

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await resolveUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      profile: {
        email: user.email ?? null,
        name: user.name ?? null,
        tier: user.tier,
        // Let the UI know which auth method this user is using
        authMethod: user.clerk_id ? "clerk" : "notion",
      },
      config: await prepareConfigForResponse(user.config as Record<string, unknown> | null),
      notion_connected:
        (user.config as Record<string, unknown> | null)?.notion_connected ?? false,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/users/config — onboarding completion (Clerk users) ──────────────

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      notionToken,
      notionDatabaseId,
      topics,
      profileDescription,
      experienceLevel,
      digestHour,
      timezoneOffset,
    } = body;

    // Validate Notion credentials before persisting — uses plaintext values
    // from the request body, before encryption.
    const check = await validateNotionCredentials(
      String(notionToken ?? ""),
      String(notionDatabaseId ?? ""),
    );
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    // Encrypt credentials at the application layer before persisting.
    const [encryptedToken, encryptedDatabaseId] = await Promise.all([
      encrypt(String(notionToken)),
      encrypt(String(notionDatabaseId)),
    ]);

    const { data, error } = await saveUserConfig(userId, {
      notion_token: encryptedToken,
      notion_database_id: encryptedDatabaseId,
      notion_connected: true,
      topics,
      profile_description: profileDescription,
      experience_level: experienceLevel,
      ...(typeof digestHour === "number" ? { digest_hour: digestHour } : {}),
      ...(typeof timezoneOffset === "number" ? { timezone_offset: timezoneOffset } : {}),
    });

    if (error) {
      console.error("Upsert user_configs error:", error);
      return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
    }

    return NextResponse.json({ config: await prepareConfigForResponse(data as Record<string, unknown>) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/users/config — partial settings update ────────────────────────

export async function PATCH(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const ALLOWED_FIELDS: Record<string, string> = {
      notionToken: "notion_token",
      notionDatabaseId: "notion_database_id",
      notionConnected: "notion_connected",
      topics: "topics",
      profileDescription: "profile_description",
      experienceLevel: "experience_level",
      digestHour: "digest_hour",
      timezoneOffset: "timezone_offset",
      scoringPriorities: "scoring_priorities",
      // `active` is intentionally excluded — account activation/deactivation
      // must only be performed by an admin, never by the user themselves.
      notion_token: "notion_token",
      notion_database_id: "notion_database_id",
      notion_connected: "notion_connected",
      profile_description: "profile_description",
      experience_level: "experience_level",
      digest_hour: "digest_hour",
      timezone_offset: "timezone_offset",
    };

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      const col = ALLOWED_FIELDS[key];
      if (col && value !== undefined) updates[col] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Encrypt credential fields when they are being updated.
    if (typeof updates["notion_token"] === "string" && updates["notion_token"]) {
      updates["notion_token"] = await encrypt(updates["notion_token"] as string);
    }
    if (typeof updates["notion_database_id"] === "string" && updates["notion_database_id"]) {
      updates["notion_database_id"] = await encrypt(updates["notion_database_id"] as string);
    }

    const { data, error } = await saveUserConfig(userId, updates);

    if (error) {
      console.error("Update user_configs error:", error);
      return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
    }

    return NextResponse.json({ config: await prepareConfigForResponse(data as Record<string, unknown>) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
