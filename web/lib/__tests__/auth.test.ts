import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockFrom, mockCookies } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockCookies: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: mockFrom } }));
vi.mock("@/lib/session", () => ({ COOKIE_NAME: "__digest_sid", verifySessionToken: vi.fn() }));
vi.mock("@/lib/guest-sessions", () => ({ isGuestSessionValid: vi.fn() }));

import { getAuthUserId } from "@/lib/auth";

beforeEach(() => {
  mockAuth.mockReset();
  mockFrom.mockReset();
  mockCookies.mockReset();
});

describe("Clerk user resolution", () => {
  it("returns an existing user's internal ID", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-123" });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "internal-123" }, error: null }),
        }),
      }),
    });

    await expect(getAuthUserId()).resolves.toBe("internal-123");
    expect(mockCookies).not.toHaveBeenCalled();
  });

  it("surfaces a database outage instead of treating a signed-in user as anonymous", async () => {
    mockAuth.mockResolvedValue({ userId: "clerk-123" });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "fetch failed" } }),
        }),
      }),
    });

    await expect(getAuthUserId()).rejects.toThrow("Unable to load your account");
    expect(mockCookies).not.toHaveBeenCalled();
  });
});
