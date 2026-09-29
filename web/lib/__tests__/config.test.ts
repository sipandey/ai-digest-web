/**
 * Unit tests for /api/users/config (GET, PATCH)
 * Validates settings lifecycle, multi-lens, vacation mode (active), and Notion disconnect.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetAuthUserId, mockResolveUserById, mockFrom, chain, mockEncrypt, mockDecrypt } =
  vi.hoisted(() => {
    const c = {
      select: vi.fn(),
      upsert: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      eq: vi.fn(),
    } as Record<string, ReturnType<typeof vi.fn>>;

    const mockFrom = vi.fn().mockReturnValue(c);
    const mockGetAuthUserId = vi.fn();
    const mockResolveUserById = vi.fn();
    const mockEncrypt = vi.fn().mockImplementation(async (text: string) => `encrypted_${text}`);
    const mockDecrypt = vi.fn().mockImplementation(async (text: string) =>
      text.startsWith("encrypted_") ? text.replace("encrypted_", "") : text
    );

    return {
      mockGetAuthUserId,
      mockResolveUserById,
      mockFrom,
      chain: c,
      mockEncrypt,
      mockDecrypt,
    };
  });

vi.mock("@/lib/auth", () => ({
  getAuthUserId: mockGetAuthUserId,
  resolveUserById: mockResolveUserById,
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

import { GET, PATCH } from "../../app/api/users/config/route";

describe("/api/users/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.upsert.mockReturnValue(chain);
    chain.single.mockReturnValue(chain);
    chain.maybeSingle.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
  });

  describe("GET /api/users/config", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuthUserId.mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns profile and config with decrypted Notion database ID and stripped token", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      mockResolveUserById.mockResolvedValue({
        id: "user-123",
        email: "siddharth@example.com",
        name: "Siddharth",
        tier: "free",
        clerk_id: "user_clerk_123",
        config: {
          profile_description: "Building autonomous agents",
          digest_lens: "builder",
          experience_level: "practitioner",
          topics: ["RAG", "Agents"],
          digest_hour: 7,
          timezone_offset: 5.5,
          active: true,
          notion_connected: true,
          notion_token: "encrypted_secret_123",
          notion_database_id: "encrypted_db_abc",
        },
      });

      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.profile).toEqual({
        email: "siddharth@example.com",
        name: "Siddharth",
        tier: "free",
        authMethod: "clerk",
      });
      expect(body.config.notion_token).toBeUndefined();
      expect(body.config.notion_database_id).toBe("db_abc");
      expect(body.config.active).toBe(true);
      expect(body.config.digest_lens).toBe("builder");
    });
  });

  describe("PATCH /api/users/config", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuthUserId.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3100/api/users/config", {
        method: "PATCH",
        body: JSON.stringify({ digestLens: "founder" }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when no valid fields provided", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      const req = new NextRequest("http://localhost:3100/api/users/config", {
        method: "PATCH",
        body: JSON.stringify({ invalidField: "foo" }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("No valid fields");
    });

    it("updates multi-lens and delivery preferences", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      const updatedRow = {
        user_id: "user-123",
        digest_lens: "founder",
        digest_hour: 8,
        timezone_offset: 0,
        topics: ["Startups", "GTM"],
        active: true,
      };
      chain.single.mockResolvedValue({ data: updatedRow, error: null });

      const req = new NextRequest("http://localhost:3100/api/users/config", {
        method: "PATCH",
        body: JSON.stringify({
          digestLens: "founder",
          digestHour: 8,
          timezoneOffset: 0,
          topics: ["Startups", "GTM"],
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.digest_lens).toBe("founder");
      expect(body.config.digest_hour).toBe(8);
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-123",
          digest_lens: "founder",
          digest_hour: 8,
          timezone_offset: 0,
          topics: ["Startups", "GTM"],
        }),
        { onConflict: "user_id" }
      );
    });

    it("supports vacation mode (active: false / active: true)", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      const updatedRow = { user_id: "user-123", active: false };
      chain.single.mockResolvedValue({ data: updatedRow, error: null });

      const req = new NextRequest("http://localhost:3100/api/users/config", {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "user-123", active: false }),
        { onConflict: "user_id" }
      );
    });

    it("disconnects Notion workspace cleanly without API validation error", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      const updatedRow = {
        user_id: "user-123",
        notion_connected: false,
        notion_token: null,
        notion_database_id: null,
      };
      chain.single.mockResolvedValue({ data: updatedRow, error: null });

      const req = new NextRequest("http://localhost:3100/api/users/config", {
        method: "PATCH",
        body: JSON.stringify({ disconnectNotion: true }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-123",
          notion_connected: false,
          notion_token: null,
          notion_database_id: null,
        }),
        { onConflict: "user_id" }
      );
    });
  });
});
