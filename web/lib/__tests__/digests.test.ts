/**
 * Unit tests for GET /api/users/digests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetAuthUserId, mockFrom, chain } = vi.hoisted(() => {
  const c = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
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

import { GET } from "../../app/api/users/digests/route";

describe("GET /api/users/digests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("returns 401 Unauthorized when not logged in", async () => {
    mockGetAuthUserId.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3100/api/users/digests");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns latest digest and history for authenticated user", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");

    const sampleDigest = {
      id: "digest-abc",
      run_date: "2026-09-28",
      lens: "builder",
      papers: [
        {
          arxiv_id: "2401.00001",
          title: "Graph Transformers",
          score: 8.9,
          builder_takeaway: "Use topological attention",
        },
      ],
      top_score: 8.9,
      created_at: "2026-09-28T07:00:00Z",
    };

    const sampleHistory = [
      { run_date: "2026-09-28", lens: "builder", top_score: 8.9 },
      { run_date: "2026-09-27", lens: "builder", top_score: 8.5 },
    ];

    // First query is history, then maybeSingle is digest
    chain.limit.mockResolvedValueOnce({ data: sampleHistory, error: null });
    chain.maybeSingle.mockResolvedValueOnce({ data: sampleDigest, error: null });

    const req = new NextRequest("http://localhost:3100/api/users/digests");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.digest).toEqual(sampleDigest);
    expect(body.history).toEqual(sampleHistory);
  });

  it("queries specific date when ?date param is provided", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");

    chain.limit.mockResolvedValueOnce({ data: [], error: null });
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: "d-specific", run_date: "2026-09-20", papers: [] },
      error: null,
    });

    const req = new NextRequest("http://localhost:3100/api/users/digests?date=2026-09-20");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.digest.run_date).toBe("2026-09-20");
    expect(chain.eq).toHaveBeenCalledWith("run_date", "2026-09-20");
  });
});
