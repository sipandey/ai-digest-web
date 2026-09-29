import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthUserId, resolveUserById } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/encryption";
import { isValidNotionDatabaseId, cleanNotionDatabaseId } from "@/lib/notion";

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

    if (!isValidNotionDatabaseId(databaseId)) {
      return { ok: false, error: "Invalid Notion database ID format." };
    }
    const cleanId = cleanNotionDatabaseId(databaseId);
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

  let dbId: string | null = null;
  if (typeof notion_database_id === "string" && notion_database_id) {
    try {
      dbId = await decrypt(notion_database_id);
    } catch {
      // Decryption failure — omit rather than expose ciphertext
      dbId = null;
    }
  }

  return {
    ...rest,
    notion_database_id: dbId,
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
      digestLens,
    } = body;

    // ── Input validation ─────────────────────────────────────────────────────
    const postErrors: string[] = [];

    if (typeof profileDescription === "string" && profileDescription.length > 500) {
      postErrors.push("profile_description must be 500 characters or fewer");
    }
    if (typeof digestLens === "string" && !["builder", "founder", "researcher"].includes(digestLens)) {
      postErrors.push("digest_lens must be one of: builder, founder, researcher");
    }
    if (Array.isArray(topics)) {
      if (topics.length > 5) postErrors.push("topics must have 5 items or fewer");
      if (topics.some((t: unknown) => typeof t !== "string" || (t as string).length > 60)) {
        postErrors.push("each topic must be a string of 60 characters or fewer");
      }
    }
    if (typeof digestHour === "number" && (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23)) {
      postErrors.push("digest_hour must be an integer between 0 and 23");
    }
    if (typeof timezoneOffset === "number" && (timezoneOffset < -12 || timezoneOffset > 14)) {
      postErrors.push("timezone_offset must be between -12 and 14");
    }
    if (postErrors.length > 0) {
      return NextResponse.json({ error: postErrors.join("; ") }, { status: 400 });
    }

    // Notion credentials validation (optional)
    let encryptedToken: string | null = null;
    let encryptedDatabaseId: string | null = null;
    let notionConnected = false;

    if (notionToken && notionDatabaseId) {
      const check = await validateNotionCredentials(
        String(notionToken),
        String(notionDatabaseId),
      );
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }

      [encryptedToken, encryptedDatabaseId] = await Promise.all([
        encrypt(String(notionToken)),
        encrypt(cleanNotionDatabaseId(String(notionDatabaseId))),
      ]);
      notionConnected = true;
    }

    const { data, error } = await saveUserConfig(userId, {
      ...(encryptedToken ? { notion_token: encryptedToken } : {}),
      ...(encryptedDatabaseId ? { notion_database_id: encryptedDatabaseId } : {}),
      notion_connected: notionConnected,
      topics,
      profile_description: profileDescription,
      experience_level: experienceLevel,
      ...(typeof digestLens === "string" && ["builder", "founder", "researcher"].includes(digestLens)
        ? { digest_lens: digestLens }
        : {}),
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
      digestLens: "digest_lens",
      emailDigestEnabled: "email_digest_enabled",
      deliveryEmail: "delivery_email",
      webhookUrl: "webhook_url",
      webhookPlatform: "webhook_platform",
      disconnectNotion: "disconnect_notion",
      notion_token: "notion_token",
      notion_database_id: "notion_database_id",
      notion_connected: "notion_connected",
      profile_description: "profile_description",
      experience_level: "experience_level",
      digest_hour: "digest_hour",
      timezone_offset: "timezone_offset",
      scoring_priorities: "scoring_priorities",
      digest_lens: "digest_lens",
      email_digest_enabled: "email_digest_enabled",
      delivery_email: "delivery_email",
      webhook_url: "webhook_url",
      webhook_platform: "webhook_platform",
    };

    // `active` lives on the `users` table, NOT on `user_configs` — handle it separately.
    const activeValue: boolean | undefined =
      body.active !== undefined ? Boolean(body.active) : undefined;

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      const col = ALLOWED_FIELDS[key];
      if (col && value !== undefined) updates[col] = value;
    }

    const isDisconnectingNotion =
      body.disconnectNotion === true ||
      body.disconnect_notion === true ||
      (updates["notion_connected"] === false && !body.notionToken && !body.notion_token);

    if (isDisconnectingNotion) {
      delete updates["disconnect_notion"];
      updates["notion_connected"] = false;
      updates["notion_token"] = null;
      updates["notion_database_id"] = null;
    }

    // If the only field sent was `active`, updates will be empty but that is still valid.
    const hasConfigUpdates = Object.keys(updates).length > 0;
    if (!hasConfigUpdates && activeValue === undefined) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // ── Server-side validation ────────────────────────────────────────────────
    const validationErrors: string[] = [];

    if ("profile_description" in updates) {
      const v = updates["profile_description"];
      if (v !== null && v !== "") {
        if (typeof v !== "string") {
          validationErrors.push("profile_description must be a string");
        } else if (v.length > 500) {
          validationErrors.push("profile_description must be 500 characters or fewer");
        }
      }
    }

    if ("topics" in updates) {
      const v = updates["topics"];
      if (v !== null) {
        if (!Array.isArray(v)) {
          validationErrors.push("topics must be an array");
        } else {
          if (v.length > 5) {
            validationErrors.push("topics must have 5 items or fewer");
          }
          const badItems = v.filter((t) => typeof t !== "string" || (t as string).length > 60);
          if (badItems.length > 0) {
            validationErrors.push("each topic must be a string of 60 characters or fewer");
          }
        }
      }
    }

    if ("digest_hour" in updates) {
      const v = updates["digest_hour"];
      if (v !== null && v !== undefined) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 23) {
          validationErrors.push("digest_hour must be an integer between 0 and 23");
        } else {
          updates["digest_hour"] = n; // normalise to number
        }
      }
    }

    if ("timezone_offset" in updates) {
      const v = updates["timezone_offset"];
      if (v !== null && v !== undefined) {
        const n = Number(v);
        if (isNaN(n) || n < -12 || n > 14) {
          validationErrors.push("timezone_offset must be between -12 and 14");
        } else {
          updates["timezone_offset"] = n; // normalise to number
        }
      }
    }

    if ("digest_lens" in updates) {
      const v = updates["digest_lens"];
      if (v !== null && v !== undefined) {
        if (typeof v !== "string" || !["builder", "founder", "researcher"].includes(v)) {
          validationErrors.push("digest_lens must be one of: builder, founder, researcher");
        }
      }
    }

    if ("email_digest_enabled" in updates) {
      const v = updates["email_digest_enabled"];
      if (typeof v !== "boolean") {
        updates["email_digest_enabled"] = Boolean(v);
      }
    }

    if ("delivery_email" in updates) {
      const v = updates["delivery_email"];
      if (v !== null && v !== "") {
        if (typeof v !== "string" || !v.includes("@")) {
          validationErrors.push("delivery_email must be a valid email address");
        }
      }
    }

    if ("webhook_url" in updates) {
      const v = updates["webhook_url"];
      if (v !== null && v !== "") {
        if (typeof v !== "string" || (!v.startsWith("http://") && !v.startsWith("https://"))) {
          validationErrors.push("webhook_url must be a valid HTTP or HTTPS URL");
        }
      }
    }

    if ("webhook_platform" in updates) {
      const v = updates["webhook_platform"];
      if (v !== null && v !== undefined) {
        if (typeof v !== "string" || !["slack", "discord", "generic"].includes(v)) {
          validationErrors.push("webhook_platform must be one of: slack, discord, generic");
        }
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join("; ") }, { status: 400 });
    }

    // ── Notion credential validation (before encryption) ─────────────────────
    // Validate whenever either credential field is being updated, using the
    // plaintext values from the request. If only one field is changing, fetch
    // and decrypt the other from the DB so validateNotionCredentials() can
    // test both together against the Notion API.
    const updatingToken =
      !isDisconnectingNotion &&
      typeof updates["notion_token"] === "string" &&
      !!updates["notion_token"];
    const updatingDbId =
      !isDisconnectingNotion &&
      typeof updates["notion_database_id"] === "string" &&
      !!updates["notion_database_id"];

    if (updatingToken || updatingDbId) {
      let plainToken: string;
      let plainDbId: string;

      if (updatingToken) {
        plainToken = updates["notion_token"] as string;
      } else {
        // Token not changing — fetch the current encrypted value and decrypt it.
        const { data: cur } = await supabaseAdmin
          .from("user_configs")
          .select("notion_token")
          .eq("user_id", userId)
          .maybeSingle();
        if (!cur?.notion_token) {
          return NextResponse.json(
            { error: "No Notion token on file — provide both token and database ID." },
            { status: 400 },
          );
        }
        plainToken = await decrypt(cur.notion_token as string);
      }

      if (updatingDbId) {
        plainDbId = updates["notion_database_id"] as string;
      } else {
        // Database ID not changing — fetch the current encrypted value and decrypt it.
        const { data: cur } = await supabaseAdmin
          .from("user_configs")
          .select("notion_database_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!cur?.notion_database_id) {
          return NextResponse.json(
            { error: "No Notion database ID on file — provide both token and database ID." },
            { status: 400 },
          );
        }
        plainDbId = await decrypt(cur.notion_database_id as string);
      }

      const credCheck = await validateNotionCredentials(plainToken, plainDbId);
      if (!credCheck.ok) {
        return NextResponse.json({ error: credCheck.error }, { status: 400 });
      }
    }

    // Encrypt credential fields when they are being updated.
    if (updatingToken) {
      updates["notion_token"] = await encrypt(updates["notion_token"] as string);
    }
    if (updatingDbId) {
      updates["notion_database_id"] = await encrypt(
        cleanNotionDatabaseId(updates["notion_database_id"] as string),
      );
    }

    let configData: Record<string, unknown> = {};

    if (hasConfigUpdates) {
      console.log("[PATCH config] updates to upsert:", JSON.stringify(updates));
      const { data, error } = await saveUserConfig(userId, updates);

      if (error) {
        console.error("Update user_configs error:", JSON.stringify(error));
        return NextResponse.json(
          { error: "Failed to update config", detail: error.message, code: error.code },
          { status: 500 },
        );
      }

      configData = data as Record<string, unknown>;
    }

    // Update `active` on the `users` table (vacation mode) — separate from user_configs.
    if (activeValue !== undefined) {
      const { error: activeError } = await supabaseAdmin
        .from("users")
        .update({ active: activeValue })
        .eq("id", userId);
      if (activeError) {
        console.error("Update users.active error:", activeError);
        // Non-fatal: config was saved; surface the active value from request body.
      }
      // Merge active into the response so the client sees the updated value.
      configData = { ...configData, active: activeValue };
    }

    return NextResponse.json({ config: await prepareConfigForResponse(configData) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("PATCH /api/users/config failed:", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
