/**
 * Unit tests for /api/users/test-webhook (POST)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetAuthUserId } = vi.hoisted(() => ({
  mockGetAuthUserId: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUserId: mockGetAuthUserId,
}));

import { POST } from "../../app/api/users/test-webhook/route";

describe("POST /api/users/test-webhook", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUserId.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3100/api/users/test-webhook", {
      method: "POST",
      body: JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/xxx" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when webhook URL is missing", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");
    const req = new NextRequest("http://localhost:3100/api/users/test-webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing or invalid webhook URL");
  });

  it("returns 400 when webhook URL protocol is invalid", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");
    const req = new NextRequest("http://localhost:3100/api/users/test-webhook", {
      method: "POST",
      body: JSON.stringify({ webhookUrl: "ftp://example.com/webhook" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("must start with http:// or https://");
  });

  it("sends Slack payload and returns 200 on success", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;

    const req = new NextRequest("http://localhost:3100/api/users/test-webhook", {
      method: "POST",
      body: JSON.stringify({
        webhookUrl: "https://hooks.slack.com/services/T1/B1/K1",
        webhookPlatform: "slack",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T1/B1/K1",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("AI Research Digest · Connection Test"),
      })
    );
  });

  it("sends Discord payload with embeds on discord platform", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    global.fetch = mockFetch;

    const req = new NextRequest("http://localhost:3100/api/users/test-webhook", {
      method: "POST",
      body: JSON.stringify({
        webhookUrl: "https://discord.com/api/webhooks/123/xyz",
        webhookPlatform: "discord",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/123/xyz",
      expect.objectContaining({
        body: expect.stringContaining("embeds"),
      })
    );
  });

  it("returns 400 when webhook endpoint returns error status", async () => {
    mockGetAuthUserId.mockResolvedValue("user-123");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue("Not found"),
    });
    global.fetch = mockFetch;

    const req = new NextRequest("http://localhost:3100/api/users/test-webhook", {
      method: "POST",
      body: JSON.stringify({
        webhookUrl: "https://hooks.slack.com/services/invalid",
        webhookPlatform: "slack",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Webhook returned HTTP 404");
  });
});
