import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");

    // Fetch history of past digest dates for date navigation
    const { data: historyData } = await supabaseAdmin
      .from("digests")
      .select("run_date, lens, top_score")
      .eq("user_id", userId)
      .order("run_date", { ascending: false })
      .limit(14);

    let digestQuery = supabaseAdmin
      .from("digests")
      .select("id, run_date, lens, papers, top_score, created_at")
      .eq("user_id", userId);

    if (dateParam) {
      digestQuery = digestQuery.eq("run_date", dateParam);
    } else {
      digestQuery = digestQuery.order("run_date", { ascending: false }).limit(1);
    }

    const { data: digestData, error: digestError } = await digestQuery.maybeSingle();

    if (digestError) {
      console.error("Error fetching digest:", digestError);
      return NextResponse.json({ error: "Failed to fetch digest" }, { status: 500 });
    }

    return NextResponse.json({
      digest: digestData ?? null,
      history: historyData ?? [],
    });
  } catch (err) {
    console.error("Unexpected error in /api/users/digests:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
