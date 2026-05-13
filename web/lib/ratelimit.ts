/**
 * Distributed sliding-window rate limiter backed by Upstash Redis.
 *
 * Requires two environment variables (copy from your Upstash Console → REST API):
 *   UPSTASH_REDIS_REST_URL   — e.g. https://<id>.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — the read/write token
 *
 * If either variable is absent (local dev without Upstash), the function falls
 * back to a best-effort in-memory Map so development still works without any
 * external service.  The in-memory store is NOT reliable in production because
 * each Vercel invocation may be a fresh cold start.
 *
 * Usage (unchanged from the old implementation — just add await):
 *   const { allowed } = await rateLimit(ip, { limit: 10, windowMs: 60_000 });
 *   if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Upstash path ──────────────────────────────────────────────────────────────

// One Ratelimit instance per (limit, windowMs) pair.  Instances are module-level
// singletons so we don't create a new Redis connection on every request.
const upstashInstances = new Map<string, Ratelimit>();

function getUpstashInstance(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  if (upstashInstances.has(cacheKey)) return upstashInstances.get(cacheKey)!;

  const windowSecs = Math.max(1, Math.round(windowMs / 1000));
  const instance = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, `${windowSecs} s`),
    analytics: false,
  });
  upstashInstances.set(cacheKey, instance);
  return instance;
}

// ── In-memory fallback (local dev / missing credentials) ─────────────────────

type Entry = { count: number; resetAt: number };
const memStore = new Map<string, Entry>();

let lastPrune = 0;
function maybePrune() {
  const now = Date.now();
  if (now - lastPrune < 5 * 60_000) return;
  lastPrune = now;
  for (const [key, entry] of memStore.entries()) {
    if (now > entry.resetAt) memStore.delete(key);
  }
}

function memRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  maybePrune();
  const now = Date.now();
  const entry = memStore.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    memStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ── Public API ─────────────────────────────────────────────────────────────────

const upstashConfigured =
  typeof process !== "undefined" &&
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

export async function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!upstashConfigured) {
    // Local dev without Upstash — best-effort in-memory fallback.
    return memRateLimit(key, limit, windowMs);
  }

  const rl = getUpstashInstance(limit, windowMs);
  const { success, remaining, reset } = await rl.limit(key);
  // Upstash `reset` is a Unix timestamp in milliseconds.
  return { allowed: success, remaining, resetAt: reset };
}
