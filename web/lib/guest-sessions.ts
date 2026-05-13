/**
 * Server-side guest session persistence and revocation.
 *
 * Backs the `guest_sessions` table introduced in
 * supabase/migrations/20250513_guest_sessions.sql.
 *
 * Design notes
 * ─────────────
 * • Every new guest session writes one row keyed on `jti` (a UUID embedded in
 *   the HMAC token payload).
 * • `verifySessionToken` in session.ts validates the cryptographic signature;
 *   `isGuestSessionValid` in this file checks the DB for revocation.
 * • Logout sets `revoked_at` instead of only clearing the cookie, so stolen
 *   tokens that survive cookie removal are still rejected on the next API call.
 * • Legacy tokens (no `jti` claim, minted before this migration) bypass the DB
 *   check and are accepted until they expire — callers pass `null` to signal
 *   this.
 */

import { supabaseAdmin } from "./supabase";
import { EXPIRY_SECONDS } from "./session";

/**
 * Persist a newly issued session.  Call this immediately after
 * `createSessionToken` succeeds — before setting the cookie.
 *
 * Errors are logged but not re-thrown: a DB hiccup should not prevent login.
 */
export async function persistGuestSession(
  jti: string,
  userId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + EXPIRY_SECONDS * 1000).toISOString();
  const { error } = await supabaseAdmin.from("guest_sessions").insert({
    jti,
    user_id: userId,
    expires_at: expiresAt,
  });
  if (error) {
    console.error("persistGuestSession — insert error:", error);
  }
}

/**
 * Soft-delete a session on logout.  Sets `revoked_at = now()` so any
 * in-flight token for this session is immediately rejected.
 *
 * No-ops silently if the row doesn't exist (e.g. legacy token without jti).
 */
export async function revokeGuestSession(jti: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("guest_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("jti", jti)
    .is("revoked_at", null); // idempotent — only update if not already revoked
  if (error) {
    console.error("revokeGuestSession — update error:", error);
  }
}

/**
 * Returns true if the session is active (not revoked and not expired).
 *
 * Pass `null` for `jti` when the token was minted before the revocation
 * feature (no `jti` claim) — this function returns `true` immediately so
 * legacy sessions continue working until they expire naturally.
 */
export async function isGuestSessionValid(
  jti: string | null,
): Promise<boolean> {
  // Legacy token — no jti claim; skip the DB check.
  if (jti === null) return true;

  const { data, error } = await supabaseAdmin
    .from("guest_sessions")
    .select("jti")
    .eq("jti", jti)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    // Log but fail open: a transient DB error should not log out the user.
    console.error("isGuestSessionValid — query error:", error);
    return true;
  }

  return data !== null;
}
