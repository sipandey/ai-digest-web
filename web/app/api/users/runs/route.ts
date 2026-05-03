import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Resolve internal user ID
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", clerkId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: runs, error: runsError } = await supabaseAdmin
      .from("pipeline_runs")
      .select(
        "id, run_date, status, papers_fetched, papers_passed, top_score, notion_page_url, error_message, started_at, completed_at"
      )
      .eq("user_id", user.id)
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
