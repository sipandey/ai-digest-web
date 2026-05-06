/**
 * Next.js proxy middleware (proxy.ts in Next.js 16).
 * Runs on the Edge runtime for every non-static request.
 *
 * Responsibilities:
 *   1. Generate a cryptographically random per-request nonce.
 *   2. Forward the nonce to Server Components via the `x-nonce` request header
 *      (Next.js reads this to nonce its own hydration scripts; Clerk v7's
 *      DynamicClerkScripts reads it via headers() for its own script tags).
 *   3. Set a dynamic `Content-Security-Policy` response header with the nonce,
 *      replacing the static `unsafe-inline` that was previously in next.config.ts.
 *   4. Enforce route protection: public routes pass through; protected routes
 *      require either a Clerk session or a valid __digest_sid guest cookie.
 *
 * CSP notes:
 *   - `'nonce-{value}'` — only scripts carrying this nonce attribute are allowed.
 *   - `'strict-dynamic'` — scripts loaded by a nonce-trusted script are also
 *     trusted, covering Next.js's dynamic chunk loading and Clerk's SDK loader.
 *   - `'unsafe-inline'` is intentionally absent from script-src.
 *   - `'unsafe-inline'` remains in style-src because Tailwind CSS and Clerk
 *     component styles use inline style attributes that cannot be nonce-tagged.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";

// ── CSP builder ───────────────────────────────────────────────────────────────

const CLERK_HOSTS = [
  "https://*.clerk.com",
  "https://*.clerk.accounts.dev",
  "https://challenges.cloudflare.com",
].join(" ");

function buildCSP(nonce: string): string {
  return [
    // Default: same origin only.
    "default-src 'self'",

    // Scripts: nonce-gated + strict-dynamic (no unsafe-inline).
    // strict-dynamic propagates trust to dynamically loaded chunks.
    // Clerk host allowlist provides fallback for browsers without strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${CLERK_HOSTS}`,

    // Styles: unsafe-inline required for Tailwind and Clerk component styles.
    "style-src 'self' 'unsafe-inline'",

    // Images: same origin, data URIs, any HTTPS.
    "img-src 'self' data: https:",

    // Fonts: same origin and data URIs.
    "font-src 'self' data:",

    // Fetch / XHR: same origin + Clerk auth + Supabase.
    `connect-src 'self' ${CLERK_HOSTS} https://*.supabase.co`,

    // Frames: Clerk CAPTCHA only.
    "frame-src https://challenges.cloudflare.com",

    // Workers: none.
    "worker-src 'none'",

    // Blocks this app from being framed by any origin.
    "frame-ancestors 'none'",

    // All navigation must go to same origin.
    "base-uri 'self'",

    // Forms must submit to same origin.
    "form-action 'self'",
  ].join("; ");
}

// ── route config ──────────────────────────────────────────────────────────────

const isPublicRoute = createRouteMatcher([
  "/",
  "/signup(.*)",
  "/login(.*)",
  "/setup(.*)",              // Notion-first onboarding — no auth required
  "/privacy",
  "/terms",
  "/api/auth/webhook(.*)",
  "/api/guest/(.*)",         // Guest setup + verify API — no auth required
  "/api/users/test-notion",  // Stateless credential check — called before session exists
]);

// ── middleware ────────────────────────────────────────────────────────────────

export default clerkMiddleware(async (auth, request) => {
  // ── 1. Generate per-request nonce and set CSP ─────────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCSP(nonce);

  // Forward nonce + CSP to Server Components via request headers.
  // Next.js reads `x-nonce` to nonce its own hydration scripts.
  // Clerk's DynamicClerkScripts also reads `x-nonce` via headers().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  // ── 2. Route protection ───────────────────────────────────────────────────
  // Public routes — attach nonce headers and allow through.
  if (isPublicRoute(request)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("content-security-policy", csp);
    return response;
  }

  // Protected routes — require Clerk session or guest cookie.

  // 2a. Clerk session
  const { userId } = await auth();
  if (userId) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("content-security-policy", csp);
    return response;
  }

  // 2b. Digest session cookie (Notion-first / guest users)
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload?.sub) {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.headers.set("content-security-policy", csp);
      return response;
    }
  }

  // 2c. Neither auth method — redirect to landing page
  return NextResponse.redirect(new URL("/", request.url));
});

// ── matcher ───────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets.
    // This ensures every HTML response gets a fresh nonce in its CSP.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
