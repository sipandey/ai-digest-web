import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { COOKIE_NAME } from "@/lib/session";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [userResult, configResult, digestResult, feedbackResult, runResult, attemptResult] =
      await Promise.all([
        supabaseAdmin.from("users").select("email, name, tier, created_at").eq("id", userId).single(),
        supabaseAdmin
          .from("user_configs")
          .select("topics, profile_description, experience_level, digest_lens, digest_hour, timezone_offset, active, email_digest_enabled, delivery_email, webhook_platform, notion_connected")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("digests")
          .select("run_date, lens, papers, top_score, created_at")
          .eq("user_id", userId)
          .order("run_date", { ascending: false }),
        supabaseAdmin
          .from("paper_feedback")
          .select("arxiv_id, rating, paper_title, paper_categories, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        supabaseAdmin
          .from("pipeline_runs")
          .select("run_date, status, papers_fetched, papers_passed, top_score, started_at, completed_at")
          .eq("user_id", userId)
          .order("run_date", { ascending: false }),
        supabaseAdmin
          .from("pipeline_run_attempts")
          .select("run_date, source, status, error_class, created_at, completed_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

    const failure = [userResult, configResult, digestResult, feedbackResult, runResult, attemptResult]
      .find((result) => result.error);
    if (failure?.error || !userResult.data) {
      console.error("Account data export failed:", failure?.error);
      return NextResponse.json({ error: "Could not prepare your account export." }, { status: 500 });
    }

    const payload = {
      exported_at: new Date().toISOString(),
      account: userResult.data,
      preferences: configResult.data,
      digests: digestResult.data ?? [],
      paper_feedback: feedbackResult.data ?? [],
      pipeline_history: runResult.data ?? [],
      pipeline_attempts: attemptResult.data ?? [],
      note: "Bookmarks are stored locally. The exporting browser adds its saved bookmarks as browser_bookmarks.",
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-digest-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Account data export error:", error);
    return NextResponse.json({ error: "Could not prepare your account export." }, { status: 500 });
  }
}

export async function DELETE() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data: user, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("id, clerk_id")
      .eq("id", userId)
      .single();
    if (lookupError || !user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (user.clerk_id) {
      return NextResponse.json(
        { error: "Delete this identity through the signed-in account flow." },
        { status: 409 },
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", userId);
    if (deleteError) throw deleteError;

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("Notion-first account deletion failed:", error);
    return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  }
}
