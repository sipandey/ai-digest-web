import type { NextConfig } from "next";

// Clerk CDN hosts that need to be whitelisted in the CSP.
// Keep this list tight — only add what Clerk's SDK actually loads.
const CLERK_HOSTS = [
  "https://*.clerk.com",
  "https://*.clerk.accounts.dev",
  "https://challenges.cloudflare.com", // Clerk CAPTCHA / bot protection
].join(" ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/(.*)",
        headers: [
          // ── Clickjacking protection ──────────────────────────────────────
          // DENY prevents any site from framing this app (legacy header).
          // frame-ancestors 'none' in the CSP is the modern equivalent.
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

          // ── Content Security Policy ───────────────────────────────────────
          // 'unsafe-inline' on script-src is required by Next.js App Router
          // which injects inline <script> tags for hydration. To remove it,
          // configure a per-request nonce (see BACKLOG.md H-2b):
          // https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
          {
            key: "Content-Security-Policy",
            value: [
              // Default: same origin only.
              "default-src 'self'",

              // Scripts: same origin + inline (Next.js requirement) + Clerk CDN.
              `script-src 'self' 'unsafe-inline' ${CLERK_HOSTS}`,

              // Styles: inline needed for Tailwind and Clerk component styles.
              "style-src 'self' 'unsafe-inline'",

              // Images: same origin, data URIs, and any HTTPS (avatars, OG images).
              "img-src 'self' data: https:",

              // Fonts: same origin and data URIs.
              "font-src 'self' data:",

              // Fetch / XHR: same origin + Clerk auth + Supabase.
              `connect-src 'self' ${CLERK_HOSTS} https://*.supabase.co`,

              // Frames: Clerk CAPTCHA only.
              "frame-src https://challenges.cloudflare.com",

              // Workers: none (no service workers in use).
              "worker-src 'none'",

              // Blocks this app from being framed by any origin (CSP equivalent of X-Frame-Options).
              "frame-ancestors 'none'",

              // All navigation must go to same-origin or known external URLs.
              "base-uri 'self'",

              // Forms must submit to same origin.
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
