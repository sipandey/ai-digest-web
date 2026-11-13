import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const runDate = new Date().toISOString().slice(0, 10);
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

    const [attemptResult, dailyResult, budgetResult] = await Promise.all([
      supabaseAdmin
        .from("pipeline_run_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("run_date", runDate)
        .eq("source", "manual"),
      supabaseAdmin
        .from("pipeline_run_attempts")
        .select("id", { count: "exact", head: true })
        .eq("run_date", runDate),
      supabaseAdmin
        .from("pipeline_budget_settings")
        .select("daily_attempt_limit, manual_attempt_limit")
        .eq("singleton", true)
        .maybeSingle(),
    ]);
    const usage = attemptResult.error || dailyResult.error || budgetResult.error
      ? null
      : {
          manualAttemptsToday: attemptResult.count ?? 0,
          manualLimit: budgetResult.data?.manual_attempt_limit ?? 1,
          dailyAttempts: dailyResult.count ?? 0,
          dailyLimit: budgetResult.data?.daily_attempt_limit ?? 50,
        };

    if (!usage) {
      console.error("Could not load pipeline usage:", attemptResult.error ?? dailyResult.error ?? budgetResult.error);
    }

    return NextResponse.json({ runs: runs ?? [], usage });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
