import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";

const isPublicRoute = createRouteMatcher([
  "/",
  "/signup(.*)",
  "/login(.*)",
  "/setup(.*)",           // Notion-first onboarding — no auth required
  "/api/auth/webhook(.*)",
  "/api/guest/(.*)",         // Guest setup + verify API — no auth required
  "/api/users/test-notion",  // Stateless Notion credential check — called before session exists
]);

export default clerkMiddleware(async (auth, request) => {
  // Public routes — always allow through
  if (isPublicRoute(request)) return NextResponse.next();

  // ── 1. Clerk session ──────────────────────────────────────────────────────
  const { userId } = await auth();
  if (userId) return NextResponse.next();

  // ── 2. Digest session cookie (Notion-first / guest users) ─────────────────
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload?.sub) return NextResponse.next();
  }

  // ── Neither auth method — send back to landing ────────────────────────────
  return NextResponse.redirect(new URL("/", request.url));
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
