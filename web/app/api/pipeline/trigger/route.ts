import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Resolve user + config in one query
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, user_configs(notion_connected)")
      .eq("clerk_id", clerkId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const configs = user.user_configs as { notion_connected: boolean }[];
    const notionConnected = configs?.[0]?.notion_connected ?? false;

    if (!notionConnected) {
      return NextResponse.json(
        { error: "Notion not connected — complete onboarding first" },
        { status: 400 }
      );
    }

    const today = todayISO();

    // Guard against duplicate runs for today
    const { data: existingRun } = await supabaseAdmin
      .from("pipeline_runs")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("run_date", today)
      .maybeSingle();

    if (existingRun) {
      return NextResponse.json(
        { error: "Already ran today", status: existingRun.status },
        { status: 400 }
      );
    }

    // Insert pending run record
    const { data: run, error: insertError } = await supabaseAdmin
      .from("pipeline_runs")
      .insert({ user_id: user.id, run_date: today, status: "pending" })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert pipeline_run error:", insertError);
      return NextResponse.json({ error: "Failed to queue run" }, { status: 500 });
    }

    // TODO: wire up real pipeline trigger (GitHub Actions dispatch or queue)
    console.log(`Pipeline triggered for user ${user.id} (run ${run.id})`);

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: "Your digest is being generated. Check back in a few minutes.",
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
