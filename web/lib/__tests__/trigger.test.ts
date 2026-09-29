/**
 * Unit tests for POST /api/pipeline/trigger
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAuthUserId, mockFrom, chain, mockSpawn } = vi.hoisted(() => {
  const c = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>;

  const mockFrom = vi.fn().mockReturnValue(c);
  const mockGetAuthUserId = vi.fn();
  const mockSpawn = vi.fn().mockReturnValue({
    unref: vi.fn(),
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  });

  return { mockGetAuthUserId, mockFrom, chain: c, mockSpawn };
});

vi.mock("@/lib/auth", () => ({
  getAuthUserId: mockGetAuthUserId,
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

import { POST } from "../../app/api/pipeline/trigger/route";

describe("POST /api/pipeline/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PIPELINE_TRIGGER_MODE = "direct";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";
    process.env.OPENAI_API_KEY = "dummy-openai-key";

    mockFrom.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.not.mockReturnValue(chain);
    chain.insert.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
  });

  it("returns 401 Unauthorized when not logged in", async () => {
    mockGetAuthUserId.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 if user has not completed onboarding", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");

    // 1. System budget check
    chain.in.mockResolvedValueOnce({ count: 5, error: null });
    // 2. User lookup returning no user_configs
    chain.single.mockResolvedValueOnce({
      data: { id: "user-123", user_configs: [] },
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("complete onboarding");
  });

  it("allows trigger when user has onboarding config even without Notion", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");

    // 1. System budget check
    chain.in.mockResolvedValueOnce({ count: 5, error: null });
    // 2. User lookup with config (no notion required)
    chain.single.mockResolvedValueOnce({
      data: {
        id: "user-123",
        user_configs: [{ id: "cfg-123", updated_at: "2026-09-28T10:00:00Z" }],
      },
      error: null,
    });
    // 3. Check existing run for today
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // 4. Insert pending run
    chain.single.mockResolvedValueOnce({
      data: { id: "run-new-456" },
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runId).toBe("run-new-456");
    expect(mockSpawn).toHaveBeenCalled();
  });
});
