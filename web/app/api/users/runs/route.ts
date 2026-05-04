import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: runs, error: runsError } = await supabaseAdmin
      .from("pipeline_runs")
      .select(
        "id, run_date, status, papers_fetched, papers_passed, top_score, notion_page_url, error_message, started_at, completed_at",
      )
      .eq("user_id", userId)
      .order("run_date", { ascending: false })
      .limit(7);

    if (runsError) {
      console.error("Fetch runs error:", runsError);
      return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
    }

    return NextResponse.json({ runs: runs ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
