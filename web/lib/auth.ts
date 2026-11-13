/**
 * Unified auth — resolves the internal user UUID from either:
 *   1. A Clerk session  (email-signup users)
 *   2. A signed cookie  (Notion-first / guest users)
 *
 * All API routes should call getAuthUserId() instead of importing
 * auth() from Clerk directly.
 */

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";
import { verifySessionToken, COOKIE_NAME } from "./session";
import { isGuestSessionValid } from "./guest-sessions";

/**
 * Returns the internal users.id UUID for the currently authenticated user,
 * or null if not authenticated by any method.
 *
 * Resolution order:
 *   1. Clerk JWT  → look up users.id via clerk_id
 *   2. Digest session cookie  → payload already contains users.id
 */
export async function getAuthUserId(): Promise<string | null> {
  // ── 1. Clerk ────────────────────────────────────────────────────────────────
  let clerkId: string | null = null;
  try {
    clerkId = (await auth()).userId;
  } catch {
    // auth() can throw outside a Clerk request context; try the guest cookie.
  }

  if (clerkId) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", clerkId)
      .maybeSingle();
    if (error) throw new Error("Unable to load your account", { cause: error });
    if (data?.id) return data.id;

    // Clerk's webhook is asynchronous. Create the row if the callback arrives
    // before the webhook, while keeping database failures visible to callers.
    const { data: newUser, error: createError } = await supabaseAdmin
      .from("users")
      .upsert({ clerk_id: clerkId }, { onConflict: "clerk_id" })
      .select("id")
      .single();
    if (createError || !newUser?.id) {
      throw new Error("Unable to load your account", { cause: createError });
    }

    const { error: configError } = await supabaseAdmin
      .from("user_configs")
      .upsert({ user_id: newUser.id }, { onConflict: "user_id" });
    if (configError) {
      throw new Error("Unable to load your account", { cause: configError });
    }
    return newUser.id;
  }

  // ── 2. Session cookie ────────────────────────────────────────────────────────
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload?.sub) {
        // Server-side revocation check.  Tokens without a jti (minted before
        // the guest_sessions migration) pass through — isGuestSessionValid
        // returns true for null jti so legacy sessions keep working.
        const valid = await isGuestSessionValid(payload.jti);
        if (valid) return payload.sub;
      }
    }
  } catch {
    // cookies() throws outside of request context in some Next.js versions
  }

  return null;
}

/**
 * Fetch the full user row (id, email, name, tier) by internal UUID.
 * Includes the first user_config row as `config`.
 */
export async function resolveUserById(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, clerk_id, notion_bot_id, email, name, tier, user_configs(*)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const configs = (data.user_configs ?? []) as Record<string, unknown>[];
  return { ...data, config: configs[0] ?? null };
}
