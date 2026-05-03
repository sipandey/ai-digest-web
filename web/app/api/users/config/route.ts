import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ── shared helper ─────────────────────────────────────────────────────────────

async function resolveUser(clerkId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, clerk_id, email, name, tier, user_configs(*)")
    .eq("clerk_id", clerkId)
    .single();

  if (error || !data) return null;
  return data;
}

async function saveUserConfig(
  userId: string,
  values: Record<string, unknown>
) {
  const { data: existingConfigs, error: lookupError } = await supabaseAdmin
    .from("user_configs")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (lookupError) {
    return { data: null, error: lookupError };
  }

  const existingConfigId = existingConfigs?.[0]?.id;

  if (existingConfigId) {
    return supabaseAdmin
      .from("user_configs")
      .update(values)
      .eq("id", existingConfigId)
      .select()
      .single();
  }

  return supabaseAdmin
    .from("user_configs")
    .insert({ user_id: userId, ...values })
    .select()
    .single();
}

// ── GET /api/users/config ─────────────────────────────────────────────────────

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await resolveUser(clerkId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const configs = user.user_configs as Record<string, unknown>[];
    const config = configs?.[0] ?? null;

    return NextResponse.json({
      profile: {
        email: user.email,
        name: user.name,
        tier: user.tier,
      },
      config,
      // Convenience flat flags consumed by DashboardView redirect logic
      notion_connected: (config as Record<string, unknown> | null)?.notion_connected ?? false,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/users/config — onboarding completion ────────────────────────────

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await resolveUser(clerkId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      notionToken,
      notionDatabaseId,
      topics,
      profileDescription,
      experienceLevel,
    } = body;

    const { data, error } = await saveUserConfig(user.id, {
      notion_token: notionToken,
      notion_database_id: notionDatabaseId,
      notion_connected: true,
      topics,
      profile_description: profileDescription,
      experience_level: experienceLevel,
    });

    if (error) {
      console.error("Upsert user_configs error:", error);
      return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/users/config — partial settings update ────────────────────────

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await resolveUser(clerkId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();

    // Map camelCase request keys to snake_case DB columns
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
      active: "active",
      // Also accept snake_case keys directly from the settings form
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

    const { data, error } = await saveUserConfig(user.id, updates);

    if (error) {
      console.error("Update user_configs error:", error);
      return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
