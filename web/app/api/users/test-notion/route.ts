import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      { status: 400 }
    );
  }

  // Strip hyphens from database ID if user copied from URL with dashes
  const cleanDbId = notionDatabaseId.replace(/-/g, "");

  try {
    const res = await fetch(`${NOTION_API}/databases/${cleanDbId}`, {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (res.ok) {
      return NextResponse.json({ success: true });
    }

    if (res.status === 401) {
      return NextResponse.json(
        { success: false, error: "Invalid token — check your integration token" },
        { status: 200 } // 200 so client reads the body; success=false signals failure
      );
    }

    if (res.status === 404) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Database not found — make sure you shared the database with your integration",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Connection failed — please try again" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Connection failed — please try again" },
      { status: 200 }
    );
  }
}
