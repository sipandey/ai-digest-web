import type { NextConfig } from "next";

/**
 * Static security headers applied to every route via Next.js's headers() API.
 *
 * Content-Security-Policy is intentionally absent here — it is set dynamically
 * per request in middleware.ts with a cryptographic nonce so that
 * 'unsafe-inline' can be removed from script-src.  All other headers are
 * static and safe to set at the config layer.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // ── Clickjacking protection ──────────────────────────────────────
          // Legacy fallback; frame-ancestors 'none' in the CSP is the modern
          // equivalent and is set in middleware.ts.
          { key: "X-Frame-Options", value: "DENY" },

          // ── MIME-type sniffing ────────────────────────────────────────────
          { key: "X-Content-Type-Options", value: "nosniff" },

          // ── Referrer leakage ─────────────────────────────────────────────
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // ── Feature / permission restrictions ────────────────────────────
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
