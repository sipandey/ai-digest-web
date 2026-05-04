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
  try {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const { data } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("clerk_id", clerkId)
        .maybeSingle();
      if (data?.id) return data.id;
    }
  } catch {
    // auth() can throw in middleware contexts; fall through to cookie check
  }

  // ── 2. Session cookie ────────────────────────────────────────────────────────
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload?.sub) return payload.sub;
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
