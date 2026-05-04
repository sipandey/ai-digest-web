/**
 * POST /api/users/test-notion
 *
 * Stateless Notion credential validator.  Tests whether a given integration
 * token can access a given database.  No auth required — this route is called
 * by the guest setup form before a session cookie exists, and by the settings
 * form for authenticated users.
 */

import { NextRequest, NextResponse } from "next/server";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function POST(req: NextRequest) {
  let notionToken: string;
  let notionDatabaseId: string;

  try {
    ({ notionToken, notionDatabaseId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!notionToken || !notionDatabaseId) {
    return NextResponse.json(
      { error: "notionToken and notionDatabaseId are required" },
      { status: 400 },
    );
  }

  const cleanDbId = notionDatabaseId.replace(/-/g, "");

  try {
    const res = await fetch(`${NOTION_API}/databases/${cleanDbId}`, {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) return NextResponse.json({ success: true });

    if (res.status === 401) {
      return NextResponse.json({
        success: false,
        error: "Invalid token — check your integration token",
      });
    }

    if (res.status === 404) {
      return NextResponse.json({
        success: false,
        error: "Database not found — make sure you shared it with your integration",
      });
    }

    return NextResponse.json({
      success: false,
      error: "Connection failed — please try again",
    });
  } catch {
    return NextResponse.json({
      success: false,
      error: "Connection failed — please try again",
    });
  }
}
