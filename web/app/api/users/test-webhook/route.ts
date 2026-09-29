import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { webhookUrl, webhookPlatform = "slack" } = body;

    if (!webhookUrl || typeof webhookUrl !== "string") {
      return NextResponse.json({ error: "Missing or invalid webhook URL" }, { status: 400 });
    }

    const trimmedUrl = webhookUrl.trim();
    if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
      return NextResponse.json(
        { error: "Webhook URL must start with http:// or https://" },
        { status: 400 }
      );
    }

    let payload: Record<string, unknown>;

    if (webhookPlatform === "discord") {
      payload = {
        embeds: [
          {
            title: "AI Research Digest · Connection Test",
            description: "🎉 **Webhook connected successfully!** Your daily curated research papers will be delivered to this channel.",
            color: 0x6366f1, // Indigo
            footer: { text: "AI Digest System Test" },
            timestamp: new Date().toISOString(),
          },
        ],
      };
    } else if (webhookPlatform === "slack") {
      payload = {
        text: "AI Digest: Webhook connection verified successfully!",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "AI Research Digest · Connection Test",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "🎉 *Webhook connected successfully!* Your daily curated research papers will be delivered to this channel.",
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "plain_text",
                text: "AI Digest System Test",
                emoji: true,
              },
            ],
          },
        ],
      };
    } else {
      // Generic webhook
      payload = {
        event: "test_ping",
        message: "AI Digest: Webhook connection verified successfully!",
        timestamp: new Date().toISOString(),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(trimmedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Webhook returned HTTP ${res.status}${errText ? `: ${errText.slice(0, 100)}` : ""}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Webhook ping received successfully!",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to reach webhook URL";
    return NextResponse.json({ error: `Connection failed: ${errorMsg}` }, { status: 400 });
  }
}
