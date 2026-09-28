/**
 * Unit tests for /api/users/feedback (GET, POST, DELETE)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetAuthUserId, mockFrom, chain } = vi.hoisted(() => {
  const c = {
    select: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>;

  const mockFrom = vi.fn().mockReturnValue(c);
  const mockGetAuthUserId = vi.fn();
  return { mockGetAuthUserId, mockFrom, chain: c };
});

vi.mock("@/lib/auth", () => ({
  getAuthUserId: mockGetAuthUserId,
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

import { GET, POST, DELETE } from "../../app/api/users/feedback/route";

describe("/api/users/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.upsert.mockReturnValue(chain);
    chain.delete.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
  });

  describe("GET /api/users/feedback", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuthUserId.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/users/feedback");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns feedback dictionary for authenticated user", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      chain.order.mockResolvedValue({
        data: [
          { arxiv_id: "2401.0001", rating: "more" },
          { arxiv_id: "2401.0002", rating: "less" },
        ],
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/users/feedback");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.feedback).toEqual({
        "2401.0001": "more",
        "2401.0002": "less",
      });
    });
  });

  describe("POST /api/users/feedback", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuthUserId.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/users/feedback", {
        method: "POST",
        body: JSON.stringify({ arxiv_id: "2401.0001", rating: "more" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("rejects invalid rating value", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      const req = new NextRequest("http://localhost:3000/api/users/feedback", {
        method: "POST",
        body: JSON.stringify({ arxiv_id: "2401.0001", rating: "awesome" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Rating must be 'more' or 'less'");
    });

    it("successfully upserts feedback", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      chain.upsert.mockResolvedValue({ error: null });

      const req = new NextRequest("http://localhost:3000/api/users/feedback", {
        method: "POST",
        body: JSON.stringify({
          arxiv_id: "2401.0001",
          rating: "more",
          paper_title: "Advances in LLM Agents",
          paper_categories: ["cs.AI"],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.feedback.rating).toBe("more");
    });
  });

  describe("DELETE /api/users/feedback", () => {
    it("deletes feedback for a given arxiv_id", async () => {
      mockGetAuthUserId.mockResolvedValue("user-123");
      chain.eq.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const req = new NextRequest("http://localhost:3000/api/users/feedback?arxiv_id=2401.0001", {
        method: "DELETE",
      });
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
