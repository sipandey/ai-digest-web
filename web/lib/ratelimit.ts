/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Limitations: state is per-process, not shared across serverless instances.
 * For a low-traffic project this is sufficient to prevent single-client abuse.
 * Swap for Upstash Redis if you need distributed enforcement later.
 *
 * Usage:
 *   const result = rateLimit(ip, { limit: 10, windowMs: 60_000 });
 *   if (!result.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Prune stale entries periodically to avoid unbounded memory growth.
// Runs at most once per 5 minutes.
let lastPrune = 0;
function maybePrune() {
  const now = Date.now();
  if (now - lastPrune < 5 * 60_000) return;
  lastPrune = now;
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { allowed: boolean; remaining: number; resetAt: number } {
  maybePrune();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}
